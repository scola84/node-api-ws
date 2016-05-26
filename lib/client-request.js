const events = require('events');

class ClientRequest extends events.EventEmitter {
  constructor(connection, options, callback) {
    super();

    this.connection = connection;
    this.callback = callback;

    this.method = options.method || 'GET';
    this.path = options.path || '/';

    this._header = '';
    this._headers = options.headers;
    this._headersSent = false;

    this.finished = false;
  }

  handleResponse(response) {
    this.callback(response);
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

module.exports = ClientRequest;
