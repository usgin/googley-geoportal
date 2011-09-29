var express = require("express"),
app = express.createServer(),
http = require("http"),
parser = require("xml2json"),
pg = require("pg"),
login = require("./login.js");

/**
 * getData: Perform a GET request for the selected http://{host}/{path}.
 * 	Performs an arbitrary callback function upon receiving a response.
 * @param host: the hostname for the request
 * @param path: the path for the request
 * @param response: an express response object to utilize in a callback routine	
 * @param callback: a function to perform upon receiving a response
 */
getData = function(host, path, response, callback) {
	// Setup GET request options
	options = {
			host: host,
			port: 80,
			path: path		
		};
	
	// Perform the GET request. 
	http.get(options, function(res) {
		data = "";
		res.on("data", function(chunk) {
			// Chunked data is amalgamated through events on the http response object.
			data += chunk;
		});
		res.on("end", function(chunk) {
			// Once all the data has been received, run the callback function.
			callback(data, response, res.headers || null);
		});
		res.on("close", function(err) {
			// This means the response was terminated abruptly.
			response.send("The request did not complete correctly");
		});
	});
};

/**
 * toJson: Converts an XML string to JSON
 * @param xml: an XML string
 * @returns: a JSON object
 */
toJson = function(xml) {
	return parser.toJson(data, { object: true });
};

/**
 * sendJson: Sends a JSON response
 * @param data: a JSON object
 * @param res: an express response object to utilize
 */
sendJson = function(data, res) {
	res.json(toJson(data));
};

/**
 * sendXml: Sends an XML response
 * @param data: an XML string
 * @param headers: a hash of any headers to attach to the response
 * @param res: an express response object to utilize
 */
sendXml = function(data, res, headers) {
	if (headers) {
		for (h in headers) {
			res.header(h, headers[h]);
		}
	}
		
	res.send(data);
};

/**
 * sendPage: Renders a template to provide an HTML response.
 * 	Only renders the template if the data param is an XML string that
 * 	contains the XPath /csw:GetRecordByIdResponse/csw:SummaryRecord
 * @param data: an XML string representing a GetRecordById response
 * @param headers: a hash of any headers to attach to the response
 * @param res: an express response object to utilize
 */
sendHtml = function(data, res) {
	// Convert the record to JSON 
	record = toJson(data);
	
	// Check that the record seems to be a valid GetRecordByIdResponse containing a csw:SummaryRecord
	if (record.hasOwnProperty("csw:GetRecordByIdResponse")) {
		if (record["csw:GetRecordByIdResponse"].hasOwnProperty("csw:SummaryRecord")) {
			// Render the template
			//TODO: Make the template less tightly coupled to the schema of a Geoportal csw:SummaryRecord
			res.render("record.ejs", { layout: false, record: record["csw:GetRecordByIdResponse"]["csw:SummaryRecord"] });
			return;
		}
	}
	
	// Whatever the record was, it was not a metadata record.
	res.send("Metadata Identifier Not Found", 404); 
	return; 
};

/**
 * a Route to retreive an individual metadata record.
 * 	Responds to URLs of the form:
 * 		/record/{file identifier}
 * 	and the options parameter
 * 		?f=json, xml or html to determine the output format.
 * 	Parameters defined in ./login.js file set the location
 * 	to send the GetRecordById request.
 */
app.get(/^\/record\/(.+)/, function(req, res) {
	// Get the file identifier from the requested URL.
	id = req.params[0];
	
	// Check that the requested format is valid. HTML is set as the default format.
	format = req.param("f", "html");
	if (["json", "xml", "html"].indexOf(format) != -1) {
		// Assign callback functions according the requested format.
		if (format == "json") {
			callback = sendJson;
		} else if (format == "xml") {
			callback = sendXml;
		} else {
			callback = sendHtml;
		}
	} else {
		// Requested format was invalid
		res.send("Invalid Format Requested");
		return;
	}
	
	// Create the GetRecordById request URL and issue the request
	path = login.rootPath + "?request=GetRecordById&service=CSW&id=" + encodeURIComponent(id);
	getData(login.host, path, res, callback);
});

/**
 * a Route to retrieve a sitemap.xml file for this site.
 * 	Assumes that 
 * 		a) CSW Service is provided by a Geoportal Server
 * 		b) The Geoportal Server uses a PostgreSQL backend database
 * 	Parameters defined in ./login.js file set the database 
 * 	connection string appropriately.
 */
// TODO: Make this operate for a generic CSW server, although performance may be terrible
app.get("/sitemap.xml", function(req, res) {
	// Setup the connection string and begin writing the sitemap.xml string
	var conString = "tcp://" + login.dbUser + ":" + login.dbPass + "@" + login.dbHost + ":" + login.dbPort + "/" + login.dbName;
	var response = "<?xml version='1.0' encoding='UTF-8'?>\n<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>";
	
	// Make a connection to the database
	pg.connect(conString, function(err, client) {
		if (!client) {
			// No connection was made. Return an error message.
			res.send("Error Connecting to Geoportal Database.");
		} else {
			// Query the database for relevant file identifiers.
			client.query("SELECT fileidentifier FROM gpt_resource WHERE findable='true' AND approvalstatus='approved' and not fileidentifier = ''", function(err, result) {
				if (!result) {
					// There were no results.
					res.send("No results were returned");
				} else {
					// Loop through the results, add a <url> element for each to the sitemap.xml string.
					for (var i = 0; i < result.rows.length; i++) {
						response += "<url><loc>http://metadata.usgin.org/record/" + encodeURIComponent(result.rows[i].fileidentifier) + "</loc></url>";
					}
					// Finish the sitemap.xml string
					response += "</urlset>";
					
					// Apply a header indicating this is an XML doc, then send the response.
					res.header("content-type", "application/xml");
					res.send(response);
				}
			});
		}
	});
});

/**
 * a Route to serve some static files.
 * 	These files include index.html and robots.txt
 */
app.use("/", express.static(__dirname + "/static"));

/**
 * listens to port 3000
 */
app.listen(3000);
