export default {
  'Connection': {
    name: 'con',
    default: 'close',
    values: {
      'keep-alive': 1,
      'close': 0
    }
  },
  'Etag': {
    name: 'tag'
  },
  'If-Match': {
    name: 'ifm'
  },
  'If-None-Match': {
    name: 'inm'
  },
  'Message-ID': {
    name: 'mid'
  }
};
