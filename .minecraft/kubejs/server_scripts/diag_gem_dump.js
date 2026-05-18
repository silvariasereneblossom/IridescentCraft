// =============================================================================
// One-shot gem-registry diagnostic
// =============================================================================
// Logs every Apotheosis Gem registered in GemRegistry to server.log, with its
// bonus count and gem_class.key for each bonus. Lets us see whether the
// magic_weapon bonus actually loaded for solar / lunar / lightning / etc.
//
// Fires once at ServerEvents.loaded. Delete this file after triage.
// =============================================================================

(function () {
    var GemRegistry = Java.loadClass('dev.shadowsoffire.apotheosis.adventure.socket.gem.GemRegistry')
    var Gem = Java.loadClass('dev.shadowsoffire.apotheosis.adventure.socket.gem.Gem')

    ServerEvents.loaded(event => {
        try {
            var reg = GemRegistry.INSTANCE
            var keys = reg.getKeys()
            console.log('[gem-dump] GemRegistry contains ' + keys.size() + ' entries')
            var keysArr = keys.toArray()
            for (var i = 0; i < keysArr.length; i++) {
                var id = keysArr[i]
                var gem = reg.getValue(id)
                if (gem == null) {
                    console.log('[gem-dump]   ' + id + ' -> NULL')
                    continue
                }
                var bonuses = gem.getBonuses()
                var classKeys = []
                for (var j = 0; j < bonuses.size(); j++) {
                    var b = bonuses.get(j)
                    try { classKeys.push(b.getGemClass().key()) } catch (_) { classKeys.push('?') }
                }
                console.log('[gem-dump]   ' + id + ' -> ' + bonuses.size() + ' bonuses [' + classKeys.join(', ') + ']')
            }
        } catch (e) {
            console.error('[gem-dump] error: ' + e)
        }
    })
})()
