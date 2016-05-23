class WebSocketWrapper {
  constructor(url, protocols) {
    this.websocket = new WebSocket(url, protocols);
  }

  get binaryType() {
    return this.websocket.binaryType;
  }

  set binaryType(binaryType) {
    this.websocket.binaryType = binaryType;
  }

  get extensions() {
    return this.websocket.extensions;
  }

  set extensions(extensions) {
    this.websocket.extensions = extensions;
  }

  get onclose() {
    return this.websocket.onclose;
  }

  set onclose(listener) {
    this.websocket.onclose = listener;
  }

  get onerror() {
    return this.websocket.onerror;
  }

  set onerror(listener) {
    this.websocket.onerror = listener;
  }

  get onmessage() {
    return this.websocket.onmessage;
  }

  set onmessage(listener) {
    this.websocket.onmessage = listener;
  }

  get onopen() {
    return this.websocket.onopen;
  }

  set onopen(listener) {
    this.websocket.onopen = listener;
  }

  get protocol() {
    return this.websocket.protocol;
  }

  set protocol(protocol) {
    this.websocket.protocol = protocol;
  }

  get readyState() {
    return this.websocket.readyState;
  }

  get url() {
    return this.websocket.url;
  }

  on(event, handler) {
    this.websocket['on' + event] = handler;
  }

  close(code, reason) {
    this.websocket.close(code, reason);
  }

  send(data) {
    this.websocket.send(data);
  }
}

module.exports = WebSocketWrapper;
