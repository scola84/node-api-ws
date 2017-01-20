import { Duplex } from 'stream';

export default class ServerRequestAdapter extends Duplex {
  constructor(mpq, headers, body) {
    super({
      objectMode: true
    });

    const [method, url] = mpq.split(' ');

    this.method = method;
    this.url = url;
    this.headers = headers;
    this.body = body;
  }

  connection(value) {
    const socket = value.socket();

    if (socket.upgradeReq) {
      this._headers = Object.assign({},
        socket.upgradeReq.headers,
        this._headers);

      delete this._headers.accept;
    }

    return this;
  }

  _read() {}

  _write(data, encoding, callback) {
    this.push(data);
    callback();
  }
}
