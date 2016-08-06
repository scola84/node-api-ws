import EventEmitter from 'events';
import { ScolaError } from '@scola/error';

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

    encoder.once('error', (error) => {
      encoder.removeAllListeners();
      this.emit('error', error);
    });

    encoder.once('data', (encodedData) => {
      encoder.removeAllListeners();

      if (this._connection.socket().readyState !==
        this._connection.socket().OPEN) {

        this.emit('error', new ScolaError('500 invalid_socket'));
        return;
      }

      this._connection.socket().send(encodedData, callback);
    });

    encoder.end([this.statusCode, this.headers, data]);
  }
}
