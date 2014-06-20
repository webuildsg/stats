


// Get all avilable log files based on files.json.

var dataDir = "data/";
var jsonFile = "logs.json";
var logFilesnames;
var logs = [];
var duration = [];


$.get( dataDir + jsonFile, function(data){
	logFilesnames = data.files;
	logFilesnames.forEach(function(thisFile, index){
		var tokens = thisFile.name.split('-');
		thisFile.month = tokens[1];
		thisFile.year = tokens[2];
		var startTime = new Date().getTime();
		$.get( dataDir + thisFile.name, function (data){
			logs[index] = new Log(data);
			logs[index].parse();
			var endTime = new Date().getTime();
			duration[index] = (endTime - startTime) / 1000;
			console.log(sliders[0].value, index);
			if (sliders[0].value == index){
				setupPage(logs[sliders[0].value], sliders[0].value);
			}
		});
	});
	var sliders = $("#slider");
	sliders[0].max = logFilesnames.length-1;
	sliders.on("input", function(){
		var choosen = sliders[0].value;
		$("#logname")[0].value = logFilesnames[choosen].month + "-" + logFilesnames[choosen].year;
		setupPage(logs[choosen], choosen);
	});
	sliders.trigger("input");
});



/**
 * Only accepts default Apache/Nginx access log format:
 * http://httpd.apache.org/docs/2.2/logs.html#common
 * Requires that /app/charts.js and /app/log.js be loaded
 * Uses Zepto.js, Handlebars.js, and d3.js
 */


/**
 * Creates an array of objects from a two dimensional array, for use with
 * Handlebars. Adds the rank to each row.
 *
 * @param   array  Two dimensional array to format
 * @return  array  An array of objects with properties: rank, name and value
 */
 function formatTableRows(array) {
	var rows = [];
	for (i = 0; i < array.length; i++) {
		var row = array[i];
		rows.push({ 'rank': i + 1, 'name': row[0], 'value': row[1] });
	}

	return rows;
 }

/**
 * Adds the generated tables and bar charts to the main page.
 */
 function setupPage(log, index) {

	$('#traffic').empty();
	$("#requests").remove();
	$("#pages").remove();
	$('#uploadbox').empty();

	if (!log){
		var source = $('#uploaded-template').html();
		var template = Handlebars.compile(source);
		var uploadbox = $('#uploadbox');
		uploadbox.html(template());
		return;
	}

	var div;
	var tableHtml;

	var source = $('#section-template').html();
	var template = Handlebars.compile(source);

	// Add the traffic line chart
	$('#traffic').css('display', 'block');
	Charts.drawTrafficLineChart('#traffic', log.traffic);

	// Next all the barcharts and tables
	// Format: div id, table var, second column head, third column head
	var sectionInfo = [
	//['hosts',       log.hosts,       'Host',      'Hits'],
	['requests',    log.requests,    'Request',   'Hits'],
	['pages',       log.pages,       'Page',      'Hits'],
	//['ref',         log.referrers,   'Referrer',  'Hits'],
	//['refdomains',  log.refDomains,  'Domain',    'Hits'],
	//['errors',      log.errors,      'Error',    'Hits']
	];

	// Loop through each barChartInfo element
	// and display the div, build the bar chart, and the table
	for (var i = 0; i < sectionInfo.length; i++) {
		var j;

		var section = {
			'id': sectionInfo[i][0],
			'sectionName': sectionInfo[i][2] + 's',
			'colOne': sectionInfo[i][2],
			'colTwo': sectionInfo[i][3],
			'rows': formatTableRows(sectionInfo[i][1])
		};

		var html = template(section);
		$('#content').append(html);

		// Get top ten values, add the bar chart
		divID = '#' + sectionInfo[i][0];
		var topTen = sectionInfo[i][1].slice(0,10);
		for (j = 0; j < topTen.length; j++) {
			topTen[j] = topTen[j][1];
		}

		Charts.drawBarChart(divID, topTen);

		// Display the section
		div = $(divID);
		div.css('display', 'block');

		// Get list of table rows to add event listeners to
		var links = div.find('.container')[0]
		.getElementsByClassName('table')[0]
		.getElementsByTagName('tr');

		// Add event listeners, but skip the row containing the table head
		for (j = 1; j < links.length; j++) {
			$(links[j]).on('click', processOverlay);
		}
	}

	var timeTemplate = Handlebars.compile($('#time-template').html());
	$('#footer').html(timeTemplate({ 'duration': duration[index] }));
}

/**
 * Generates an overlay with additional information when a table row is clicked.
 *
 * @param  evt  The click event that triggered the listener
 */
 function processOverlay(evt) {
	var query = this.getElementsByTagName('td')[1].innerHTML;

	// Get section id, ie: <div id="hosts" class="section">
	var section = $(this).closest('.section').attr('id');

	// Dim the screen and disable the scrollbar
	var body = $('body');
	body.css('overflow', 'hidden');

	var source = $('#modal-template').html();
	var template = Handlebars.compile(source);

	// For hosts, display userAgent and requests
	if (section == 'hosts') {
		// Generate a list of the most common requests by that host
		var requestsTable = {
			'colOne': 'Request',
			'colTwo': 'Hits',
			'rows': formatTableRows(log.parseRequests(1000, 'host', query)),
			'query': query,
			'title': 'Host',
			'extraTitle': 'User Agent',
			'extraInfo': log.getUserAgent(query)
		};

		// Add modal, then draw line chart
		body.append(template(requestsTable));
		Charts.drawLineChart('#modal', log.parseTraffic('host', query));
	}

	// Render data for all other sections. So far, this includes a single line
	// chart showing requests over time, and a table for requesting hosts
	else {
		var sectionInfo = {
			'requests':   { 'key': 'request',   'htmlTitle': 'Request' },
			'pages'   :   { 'key': 'page',      'htmlTitle': 'Page' },
			'ref'     :   { 'key': 'referrer',  'htmlTitle': 'Referrer' },
			'refdomains': { 'key': 'refDomain', 'htmlTitle': 'Referring Domain' },
			'errors'   :  { 'key': 'request',   'htmlTitle': 'Error' }
		};

		// Generate a list of the most common hosts, with a limit of 1000
		var column = sectionInfo[section]['key'];
		var hosts = log.parseHosts(1000, column, query);
		var hostsTable = {
			'colOne': 'Host',
			'colTwo': 'Hits',
			'rows': formatTableRows(hosts),
			'query': query,
			'title': sectionInfo[section]['htmlTitle']
		};

		// Add modal, then draw line chart
		body.append(template(hostsTable));
		Charts.drawLineChart('#modal', log.parseTraffic(column, query));
	}

	$('#close').on('click', removeOverlay);

	return false;
}

/**
 * Removes the overlay element from the document body, restoring the previous
 * screen. Also re-enables the page's scrollbar.
 *
 * @param  evt  The click event that triggered the listener
 */
 function removeOverlay(evt) {
	$('body').css('overflow', 'visible');
	$('#overlay').remove();

	return false;
 }

// Register the table partial
Handlebars.registerPartial('table', $('#table-partial').html());
