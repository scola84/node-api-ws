import EventEmitter from 'events';
import { stringify as formatQuery } from 'querystring';

export default class ClientRequest extends EventEmitter {
  constructor(connection, options, callback) {
    super();

    this.connection = connection;

    this.method = options.method || 'GET';
    this.path = options.path || '/';

    if (options.query) {
      this.path += '?' + formatQuery(options.query);
    }

    this._header = '';
    this._headers = options.headers || {};
    this._headersSent = false;
    this._callback = callback;

    this.finished = false;
  }

  handleResponse(response) {
    if (this._callback) {
      this._callback(response);
    }
  }

  write(data, encoding, callback) {
    const encoder = new this.connection.codec.Encoder();

    encoder.once('error', (error) => {
      encoder.removeAllListeners();
      this.emit('error', error);
    });

    encoder.once('data', (encodedData) => {
      encoder.removeAllListeners();

      if (this.connection.socket.readyState !== this.connection.socket.OPEN) {
        this.emit('error', new Error('Socket is not open'));
        return;
      }

      console.log('write', encodedData);

      this.connection.socket.send(encodedData, callback);
    });

    data = [
      this.method + ' ' + this.path,
      this._headers,
      data
    ];

    encoder.write(data);
  }

  end(data, encoding, callback) {
    this.write(data, encoding, callback);
  }
}
