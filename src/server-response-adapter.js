import { EventEmitter } from 'events';
import { ScolaError } from '@scola/error';

export default class ServerResponseAdapter extends EventEmitter {
  constructor() {
    super();

    this._connection = null;
    this.statusCode = 200;
    this.headers = {};
  }

  connection(value) {
    if (value === null) {
      return this._connection;
    }

    this._connection = value;
    return this;
  }

  getHeader(name) {
    return this.headers[name] || this.headers[name.toLowerCase()];
  }

  setHeader(name, value) {
    this.headers[name] = value;
  }

  removeHeader(name) {
    delete this.headers[name];
    delete this.headers[name.toLowerCase()];
  }

  end(data, callback) {
    const encoder = this._connection.codec().encoder();
    const socket = this._connection.socket();

    if (!socket) {
      this.emit('error', new ScolaError('500 invalid_socket'));
      return;
    }

    encoder.once('error', (error) => {
      encoder.removeAllListeners();
      this.emit('error', error);
    });

    encoder.once('data', (encodedData) => {
      encoder.removeAllListeners();

      if (socket.readyState !== socket.OPEN) {
        this.emit('error', new ScolaError('500 invalid_socket'));
        return;
      }

      socket.send(encodedData, callback);
    });

    encoder.end([this.statusCode, this.headers, data]);
  }
}
