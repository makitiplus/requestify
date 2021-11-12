let { generate: rnd } = require("randomstring");

if(!global.requestified) {
	global.requestified = {};
}

let sk = {
	conn: {},
	sid: "",
	listen: function(callback) {
		this.conn.on("message", msg => {
			try {
				msg = JSON.parse( msg.toString("utf-8") );

				switch(msg._rqf_type) {
					case "req": {
						callback({
							...msg,
							respond: (data) => {
								global.requestified[msg.conn][msg.req]._rqf_events.resp(data);
							}
						});
					}
				}
			}
			catch(err) {}
		});
	},
	send: function(data, endpoint) {
		let msg = {
			...data,
			_rqf_endpoint: endpoint,
			_rqf_type: "orphan"
		};

		this.conn.send( JSON.stringify(msg) );
	},
	req: function(data, endpoint, open = false, timeout = 7_500) {
		let rid = (new Date()).getTime() + "#" +
			rnd({charset: "alphanumeric", length: 10})
		;

		global.requestified[this.sid][rid] = {
			...data,
			_rqf_endpoint: endpoint,
			_rqf_events: {
				resp: () => {
					if(!open)
						global.requestified[this.sid][rid]._rqf_events.close()
				},
				error: () => global.requestified[this.sid][rid]._rqf_events.close(),
				close: () => clearTimeout(global.requestified[this.sid][rid]._rqf_cancel)
			},
			_rqf_type: "req",
			_rqf_id: rid,
			_rqf_open: open
		};

		if(!open)
		global.requestified[this.sid][rid]._rqf_cancel = setTimeout(
				global.requestified[this.sid][rid]._rqf_events.error,
				timeout, "timeout"
			);

		this.conn.send( JSON.stringify( {data, conn: this.conn, req: rid, endpoint, open} ) );

		return {
			on: (ev, callback) => {
				switch(ev) {
					case "response": {
						global.requestified[this.sid][rid]._rqf_events.resp = msg => {
							callback(msg);
							if(!open)
								global.requestified[this.sid][rid]._rqf_events.close();
						};
						break;
					}
					case "error": {
						global.requestified[this.sid][rid]._rqf_events.error = error => {
							callback(error);
							global.requestified[this.sid][rid]._rqf_events.close();
						};
						break;
					}
					case "close": {
						global.requestified[this.sid][rid]._rqf_events.close = () => {
							callback();
							clearTimeout(global.requestified[this.sid][rid]._rqf_cancel);
						};
					}
				}
			}
		}
	},
	on: function(ev, callback) {
		switch(ev) {
			case "response": {
				this._rqf_events.close = () => {
					callback();
					for(let r in global.requestified[this.sid]) {
						clearTimeout(global.requestified[this.sid][r]._rqf_cancel);
					}
					delete global.requestified[this.sid];
				}
			}
		}
	}
}

function requestify(conn) {
	let sid = (new Date()).getTime() + "#" + rnd({charset: "alphanumeric", length: 12});
	global.requestified[sid] = {};
	return {
		...sk, conn, sid,
		_rqf_events: {
			close: () => {
				for(let r in global.requestified[sid]) {
					clearTimeout(global.requestified[sid][r]._rqf_cancel);
				}
				delete global.requestified[sid];
			}
		},
	}
}

module.exports = { requestify };
