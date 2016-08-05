import EventEmitter from 'events';
import { ScolaError } from '@scola/error';

export default class ServerResponseAdapter extends EventEmitter {
  constructor(connection) {
    super();

    this.connection = connection;
    this.statusCode = 200;

    this._header = '';
    this._headers = {};
    this._headersSent = false;

    this.finished = false;
  }

  getHeader(name) {
    return this._headers[name] || this._headers[name.toLowerCase()];
  }

  setHeader(name, value) {
    this._headers[name] = value;
  }

  removeHeader(name) {
    delete this._headers[name];
    delete this._headers[name.toLowerCase()];
  }

  writeHead(statusCode, statusMessage, headers) {
    if (typeof statusMessage !== 'string') {
      headers = statusMessage;
      statusMessage = null;
    }

    this.statusCode = statusCode;
    Object.assign(this._headers, headers);
  }

  write(chunk, encoding, callback) {
    const encoder = new this.connection.codec.Encoder();

    encoder.once('error', (error) => {
      encoder.removeAllListeners();
      this.emit('error', error);
    });

    encoder.once('data', (encodedData) => {
      encoder.removeAllListeners();

      if (this.connection.socket.readyState !== this.connection.socket.OPEN) {
        this.emit('error', new ScolaError('500 invalid_socket'));
        return;
      }

      this.connection.socket.send(encodedData, callback);
    });

    const data = [
      this.statusCode,
      this._headers,
      chunk
    ];

    encoder.write(data);
  }

  end(chunk, encoding, callback) {
    this.write(chunk, encoding, callback);
  }
}
