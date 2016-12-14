import { EventEmitter } from 'events';
import { ScolaError } from '@scola/core';

export default class ServerResponseAdapter extends EventEmitter {
  constructor(connection) {
    super();

    this._connection = connection;

    this.statusCode = 200;
    this.headers = {};
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
    const Encoder = this._connection.codec().Encoder;
    const encoder = new Encoder();
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
