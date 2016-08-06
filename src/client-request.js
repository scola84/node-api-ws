import EventEmitter from 'events';
import { stringify as formatQuery } from 'querystring';
import { ScolaError } from '@scola/error';

export default class ClientRequest extends EventEmitter {
  constructor() {
    super();

    this._connection = null;
    this._method = 'GET';
    this._path = '/';
    this._query = {};
    this._headers = {};
  }

  connection(connection) {
    if (typeof connection === 'undefined') {
      return this._connection;
    }

    this._connection = connection;
    return this;
  }

  method(method) {
    if (typeof method === 'undefined') {
      return this._method;
    }

    this._method = method;
    return this;
  }

  path(path) {
    if (typeof path === 'undefined') {
      return this._path;
    }

    this._path = path;
    return this;
  }

  query(query) {
    if (typeof query === 'undefined') {
      return this._query;
    }

    this._query = query;
    return this;
  }

  header(name, value) {
    if (typeof value === 'undefined') {
      return this._headers[name];
    }

    if (value === false) {
      delete this._headers[name];
      return this;
    }

    this._headers[name] = value;
    return this;
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

      this._connection.socket().send(encodedData);
    });

    if (callback) {
      this._callback = callback;
      this._connection.request(this);
    }

    encoder.end([this._mpq(), this._headers, data]);
    return this;
  }

  handleResponse(response) {
    this._callback(response);
  }

  _mpq() {
    const query = formatQuery(this._query);
    return this._method + ' ' + this._path + (query ? '?' + query : '');
  }
}
