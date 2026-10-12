;(function () {
  __host.print('')
  if (T_UNCAUGHT.length) __host.print('UNCAUGHT handler errors:\n   ' + T_UNCAUGHT.join('\n   '))
  var javaLog = T.strings(T.sget('mk.W', 'LOG'))
  if (javaLog.length) __host.print('Java registry log:\n   ' + T.join(javaLog))
  if (T_LOG.warn.length) __host.print('console.warn (' + T_LOG.warn.length + '):\n   ' + T_LOG.warn.join('\n   '))
  if (T_LOG.error.length) __host.print('console.error (' + T_LOG.error.length + '):\n   ' + T_LOG.error.join('\n   '))
  if (T_DISHONEST.length) __host.print('DISHONEST MOCKS (' + T_DISHONEST.length + '):\n   ' + T_DISHONEST.join('\n   '))
  // the suite's observable output, for `run.py snapshot`: every check, every console line, the final world
  if (__host.snapping()) {
    var kinds = ['info', 'warn', 'error']
    for (var k = 0; k < kinds.length; k++) {
      __host.snap('== console.' + kinds[k] + ' (' + T_LOG[kinds[k]].length + ')')
      for (var i = 0; i < T_LOG[kinds[k]].length; i++) __host.snap('  ' + T_LOG[kinds[k]][i])
    }
    __host.snap('== uncaught (' + T_UNCAUGHT.length + ')')
    for (var u = 0; u < T_UNCAUGHT.length; u++) __host.snap('  ' + T_UNCAUGHT[u])
    __host.snap('== world')
    __host.snap(T.state(T_server))
  }
  __host.print('RESULT: ' + T_pass + ' passed, ' + T_fail + ' failed, ' + T_UNCAUGHT.length + ' uncaught, ' +
    T.totalThrows() + ' registry-level throws, ' + T_LOAD_ERRORS.length + ' load errors, ' + T_DISHONEST.length + ' dishonest mock members')
})()
