module.exports = {
  http: require('@scola/api-http'),
  Connection: require('./lib/connection'),
  Connector: require('./lib/connector'),
  WebSocket: require('./lib/websocket-wrapper')
};
