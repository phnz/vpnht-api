var CONFIG = require('./config.json');

var CREDENTIALS = CONFIG.CREDENTIALS;

var restify = require('restify');
var cluster = require('cluster');
var mysql = require('mysql');

if (cluster.isMaster) {

	// Count the machine's CPUs
	var cpuCount = require('os').cpus().length;

	// Create a worker for each CPU
	for (var i = 0; i < cpuCount; i += 1) {
		cluster.fork();
	}

} else {

	var server = restify.createServer({
		name: 'vpnht-api',
		version: '1.0.0'
	});

	server.use(restify.acceptParser(server.acceptable));
	server.use(restify.queryParser());
	server.use(restify.bodyParser());
	server.use(restify.authorizationParser());

	// auth
	server.use(function authenticate(req, res, next) {
		if (req.username === CREDENTIALS.API_KEY && req.authorization.basic.password === CREDENTIALS.API_SECRET) {
			return next();
		} else {
			return next(new restify.NotAuthorizedError());
		}
	});

	// add user
	server.post('/user', function (req, res, next) {
		var pq;

		var connection = mysql.createConnection({
			host: CONFIG.MYSQL.HOST,
			user: CONFIG.MYSQL.USER,
			password: CONFIG.MYSQL.PASS,
			db: CONFIG.MYSQL.DB
		});

		connection.config.queryFormat = function (query, values) {
			if (!values) return query;
			return query.replace(/\:(\w+)/g, function (txt, key) {
				if (values.hasOwnProperty(key)) {
					return this.escape(values[key]);
				}
				return txt;
			}.bind(this));
		};

		connection.connect();

		// add expiration
		connection.query('INSERT INTO radcheck (username,attribute,op,value) VALUES (:username, :attr, :op, :value)', {
			username: req.params.username,
			attr: 'Expiration',
			op: ':=',
			value: req.params.expiration
		});

		// NT PASSWORD
		connection.query('INSERT INTO radcheck (username,attribute,op,value) VALUES (:username, :attr, :op, :value)', {
			username: req.params.username,
			attr: 'NT-Password',
			op: ':=',
			value: req.params.password
		});

		connection.end();
		res.send({
			code: 'Success'
		});
		return next();

	});

	server.listen(8080, function () {
		console.log('CLUSTER: %s listening at %s', server.name, server.url);
	});

};