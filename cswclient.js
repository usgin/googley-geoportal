var express = require("express"),
app = express.createServer(),
http = require("http"),
parser = require("xml2json"),
pg = require("pg"),
login = require("./login.js");

getData = function(host, path, response, callback) {
	options = {
			host: host,
			port: 80,
			path: path		
		};
	
	http.get(options, function(res) {
		data = "";
		res.on("data", function(chunk) {
			data += chunk;
		});
		res.on("end", function(chunk) {
			callback(data, res.headers || null, response);
		});
		res.on("close", function(err) {
			response.send(err.code);
		});
	});
};

toJson = function(xml) {
	return parser.toJson(data, { object: true });
};

sendJson = function(data, headers, res) {
	res.json(toJson(data));
};

sendXml = function(data, headers, res) {
	for (h in headers) {
		res.header(h, headers[h]);
	}
	res.send(data);
};

sendPage = function(data, headers, res) {
	record = toJson(data);
	record = record["csw:GetRecordByIdResponse"]["csw:SummaryRecord"];
	if (!record) { res.send("Metadata Identifier Not Found", 404); }
	
	res.render("record.ejs", { layout: false, record: record });
};

app.get("/record/:id", function(req, res) {
	format = req.param("f", "page");
	if (format == "json") {
		callback = sendJson;
	} else if (format == "xml") {
		callback = sendXml;
	} else {
		callback = sendPage;
	}
	
	path = login.rootPath + "?request=GetRecordById&service=CSW&id=" + req.param("id");
	getData(login.host, path, res, callback);
});

app.get("/sitemap.xml", function(req, res) {
	var conString = "tcp://" + login.dbUser + ":" + login.dbPass + "@" + login.dbHost + ":" + login.dbPort + "/" + login.dbName;
	var response = "<?xml version='1.0' encoding='UTF-8'?>\n<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>";
	
	pg.connect(conString, function(err, client) {
		if (!client) {
			res.send("Error");
		}
		client.query("SELECT fileidentifier FROM gpt_resource WHERE findable='true' AND approvalstatus='approved'", function(err, result) {
			if (!result) {
				res.send("No results: " + err);
			} else {
				for (var i = 0; i < result.rows.length; i++) {
					response += "<url><loc>http://metadata.usgin.org/record/" + result.rows[i].fileidentifier + "</loc></url>";
				}
				response += "</urlset>";
				res.header("content-type", "application/xml");
				res.send(response);
			}
		});
	});
});

app.use("/", express.static(__dirname + "/static"));

app.listen(3000);
