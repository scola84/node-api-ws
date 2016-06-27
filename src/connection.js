import { parse as parseUrl } from 'url';
import EventEmitter from '@scola/events';
import { ServerRequest, ServerResponse } from '@scola/api-http';

import ClientRequest from './client-request';
import ClientResponse from './client-response';
import ServerRequestAdapter from './server-request-adapter';
import ServerResponseAdapter from './server-response-adapter';

export default class Connection extends EventEmitter {
  constructor(socket, codec, router, options) {
    super();

    this.socket = socket;
    this.codec = codec;
    this.router = router;

    this._options = Object.assign({
      idHeader: 'x-id'
    }, options);

    this._id = 0;
    this._requests = {};

    this._bindSocket();
  }

  get headers() {
    if (this.socket.upgradeReq) {
      return this.socket.upgradeReq.connection.headers;
    }

    return {};
  }

  get remoteAddress() {
    if (this.socket.upgradeReq) {
      return this.socket.upgradeReq.connection.remoteAddress;
    }

    return parseUrl(this.socket.url).hostname;
  }

  get remotePort() {
    if (this.socket.upgradeReq) {
      return this.socket.upgradeReq.connection.remotePort;
    }

    return parseUrl(this.socket.url).port;
  }

  close(code, reason) {
    this.socket.close(code, reason);
    this._unbindSocket();
  }

  request(options, callback) {
    options = Object.assign({}, options);

    if (callback) {
      options.headers = Object.assign(options.headers || {}, {
        [this._options.idHeader]: ++this._id
      });
    }

    const request = new ClientRequest(this, options, callback);

    if (callback) {
      this._requests[this._id] = request;
    }

    return request;
  }

  _bindSocket() {
    this.socket.onclose = this._handleClose.bind(this);
    this.socket.onerror = this._handleError.bind(this);
    this.socket.onmessage = this._handleMessage.bind(this);
    this.socket.onopen = this._handleOpen.bind(this);
  }

  _unbindSocket() {
    this.socket.onclose = null;
    this.socket.onerror = null;
    this.socket.onmessage = null;
    this.socket.onopen = null;
  }

  _handleClose(event) {
    if (event.final) {
      this._unbindSocket();
    }

    this.emit('close', event, this);
  }

  _handleError(error) {
    this.emit('error', error);
  }

  _handleOpen(attempts) {
    this.emit('open', attempts);
  }

  _handleMessage(encodedData) {
    encodedData = encodedData.data ? encodedData.data : encodedData;
    const decoder = new this.codec.Decoder();

    decoder.once('error', (error) => {
      decoder.removeAllListeners();
      this.close(1003);
      this.emit('error', error);
    });

    decoder.once('data', (data) => {
      decoder.removeAllListeners();

      this._checkProtocol(data, (error) => {
        if (error) {
          this.close(1002);
          this.emit('error', new Error('Protocol error: ' + error.message));
          return;
        }

        if (typeof data[0] === 'string') {
          this._handleRequest(data);
        } else {
          this._handleResponse(data);
        }
      });
    });

    decoder.end(encodedData);
  }

  _handleRequest(data) {
    const requestAdapter = new ServerRequestAdapter(this, ...data);
    const responseAdapter = new ServerResponseAdapter(this);

    const request = new ServerRequest(requestAdapter);
    const response = new ServerResponse(responseAdapter);

    if (request.getHeader(this._options.idHeader)) {
      response.setHeader(this._options.idHeader,
        request.getHeader(this._options.idHeader));
    }

    this.router.handleRequest(request, response);
  }

  _handleResponse(data) {
    const response = new ClientResponse(this, ...data);

    if (response.getHeader(this._options.idHeader)) {
      const id = Number(response.getHeader(this._options.idHeader));

      if (this._requests[id]) {
        this._requests[id].handleResponse(response);
        delete this._requests[id];
      }
    }
  }

  _checkProtocol(data, callback) {
    if (!Array.isArray(data) || data.length !== 3) {
      callback(new Error('Message has an invalid structure'));
      return;
    }

    const isRequest = (/^(GET|POST|PUT|DELETE)\s(.+)$/).test(data[0]);
    const isResponse = typeof data[0] === 'number';

    if (!isRequest && !isResponse) {
      callback(new Error('Message identifier is invalid'));
      return;
    }

    if (data[1] === null || typeof data[1] !== 'object') {
      callback(new Error('Message headers are invalid'));
      return;
    }

    callback(null, data);
  }
}
