
var _ = require('gl519')
require('./server_utils.js')

_.run(function () {
    defaultEnv("PORT", 5000)
    defaultEnv("NODE_ENV", "production")
    defaultEnv("MONGOHQ_URL", "mongodb://localhost:27017/cocode")
    defaultEnv("SESSION_SECRET", "super_secret")

    var db = require('mongojs')(process.env.MONGOHQ_URL)
    var rpc_version = 1
    var rpc = {}

    rpc.setChannel = function (arg, req) {
        _.p(db.collection('channel').update({ _id : arg.channel }, {
            $set : { text : arg.text } }, { upsert : true }, _.p()))
    }

    rpc.getChannel = function (arg, req) {
        return _.p(db.collection('channel').findOne({ _id : arg.channel }, _.p())).text
    }

    var server = createServer(db,
        process.env.PORT, process.env.SESSION_SECRET,
        rpc_version, rpc)

    var channels = {}
    function joinChannel(channelName, id, ws) {
        var channel = channels[channelName]
        if (!channel) {
            channel = channels[channelName] = {
                state : {
                    text : '',
                    memberCount : 0
                },
                members : {}
            }
        }
        if (channel.members[id]) return
        channel.members[id] = ws
        channel.state.memberCount++
        updateChannel(channelName)
    }
    function updateChannel(channelName, text, notToId) {
        var channel = channels[channelName]
        if (channel && text != undefined)
            channel.state.text = text
        _.each(channel.members, function (ws, id) {
            if (id != notToId) {
                ws.send(_.json({
                    type : 'updateChannel',
                    state : channel.state
                }))
            }
        })
    }
    function leaveChannel(channelName, id) {
        var channel = channels[channelName]
        if (!channel || !channel.members[id]) return
        delete channel.members[id]
        channel.state.memberCount--
        updateChannel(channelName)
        if (channel.state.memberCount <= 0)
            delete channels[channelName]
    }

    var wss = new (require('ws').Server)({ server : server })
    wss.on('connection', function (ws) {
        var id = _.randomString(10)
        var channel = null

        ws.on('message', function (msg) {
            var msg = _.unJson(msg)
            if (msg.type == 'joinChannel') {
                channel = msg.channel
                joinChannel(channel, id, ws)
            } else if (msg.type == 'updateChannel') {
                updateChannel(channel, msg.text, id)
            }
        })

        var keepAlive = setInterval(function() {
            ws.send(_.json({ type : 'keepAlive' }))
        }, 20 * 1000)
        ws.on('close', function () {
            clearInterval(keepAlive)
            leaveChannel(channel, id)
        })
    })
})
