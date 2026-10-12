// Hand the OLD scripts' join to the next scope.
__host.stash.put('oldJoin', join)
__host.stash.put('oldSetAscension', setAscension)
__host.stash.put('oldForceScalable', forceScalable)
__host.print('old scope: ' + __spawned.length + ' spawned handlers')
