/**
 * Given the file contents of an Apache/Nginx log, parses the log data
 */

function Log(logFile) {
  // Table with: host, date, request, status (http status), bytes (transferred),
  // referrer and userAgent. Example access: logTable[1]['request']
  this.logTable    = [];

  // Parsed info, based on current selection of the log
  this.hosts       = [];
  this.requests    = [];
  this.pages       = [];
  this.referrers   = [];
  this.traffic     = [];
  this.errors      = [];
  this.refDomains  = [];

  /**
   * Returns the User Agent of the given host. It searches for the first result
   * of that host in the logs, and uses that entry's User Agent - thus ignoring
   * any subsequent changes.
   *
   * @param   host     The host to search the table for
   * @return  string   That host's User Agent
   */
  this.getUserAgent = function(host) {
    for (var i = 0; i < this.logTable.length; i++) {
      if (this.logTable[i]['host'] == host && this.logTable[i]['userAgent'])
        return this.logTable[i]['userAgent'];
    }
  };

  /**
   * Uses regex to determine whether or not the first line of the file is in
   * Common or Combined Log format. If so, returns true. Otherwise false.
   *
   * @return  boolean  True if its valid, false otherwise
   */
  this.isValid = function() {
    logSegment = logFile.slice(0, 1000);
    logSegment = logSegment.split(/[\r\n|\n]+/);

    // Regex to match against Combined Log Format
    var combined = /^\S+ \S+ \S+ \[[^\]]+\] "[^"]+" \d+ \d+ "[^"]*" "[^"]*".*$/;

    // Regex to match against Common Log Format
    var common = /^\S+ \S+ \S+ \[[^\]]+\] "[^"]+" \d+ \d+$/;

    if (logSegment[0].search(combined) == -1 && logSegment[0].search(common) == -1)
      return false;

    return true;
  };

  // Helper functions

  /**
   * When filtering log entries, returns true if the supplied log object
   * (entry/row in logTable) meets the condition set by key and match.
   * Also handles filtering by page or refDomain.
   *
   * @param   logObject  A row from logTable
   * @param   key        Either the object's key to match against, or 'refDomain'
   *                     or 'page'
   * @param   match      The string for which to check equality
   * @return  boolean    Whether or not the object meets the given condition
   */
  function meetsCondition(logObject, key, match) {
    if (key == 'refDomain') {
      if (getDomainFromURL(logObject['referrer']) == match)
        return true;
    } else if (key == 'page') {
      if (removeQueryAndFragment(logObject['request']) == match)
        return true;
    } else {
      if (logObject[key] == match)
        return true;
    }

    return false;
  }

  /**
   * Pushes the key/val pairs from a hash into an array and sorts it by its value.
   * It then trims the results to be less than or equal to n in size.
   *
   * @param  array  The hash to manipulate
   * @param  n      Number of top rows to include
   */
  function getTopNFromHash(hash, n) {
    // Assign top N from Hash to array
    var array = [];
    for (var key in hash) {
      array.push([key, hash[key]]);
    }

    // Sort on frequency, in descending order
    array.sort(function (a, b) {
      return b[1] - a[1];
    });

    // Keep top n or less and return
    array.length = n;

    return array.filter(function(){
      return true;
    });
  }

  /**
   * Given an URL as a string, returns the corresponding page by removing the
   * fragment and query, leaving the rest of the path.
   *
   * @param   url     An URL represented as a string
   * @return  string  The page corresponding to the URL
   */
  function removeQueryAndFragment(url) {
    // Remove the query from the URI if present
    query = url.indexOf('?');
    if (query != -1)
      url = url.substring(0, query);

    // Remove the fragment from the URI if present
    fragment = url.indexOf('?');
    if (fragment != -1)
      url = url.substring(0, fragment);

    return url;
  }

  function getDomainFromURL(url) {
    url = url.replace('http://', '');
    url = url.replace('https://', '');
    url = url.replace('www.', '');

    // remove everything after the authority
    var slash = url.indexOf('/');
    if (slash != -1)
      url = url.substring(0, slash);

    return url.toLowerCase();
  }

  // Parsing the log

  /**
   * Builds the logTable array of hashes. We extract the host, date, request,
   * status, bytes transferred, and referrer and store in the logTable.
   * Then calls functions to parse the logTable itself.
   */
  this.parse = function () {
    var startPos = 0;
    var endPos   = 0;

    // Split log file on new line
    var logEntries = logFile.split(/[\n]+/);

    for (var i = 0; i < logEntries.length; i++) {
      // Ignore blank lines
      if(!logEntries[i])
        continue;

      // RegEx is too slow for this, so we trade simplicity for performance
      this.logTable[i] = {};
      line = logEntries[i];

      // Match Host
      endPos = line.indexOf(' ');
      this.logTable[i]['host'] = line.substring(0, endPos);

      // Match date with format: dd/MMM/y
      // If we see a hyphen at the given index, we know identd and userid were n/a
      if (line.charAt(endPos + 3) === '-')
        startPos = endPos + 6;
      else
        startPos = line.indexOf('[', endPos) + 1;

      // For endPos, assume default strftime
      // TODO: Parse first line of log to determine strftime format in advance
      endPos = line.indexOf(' ', startPos + 16);
      this.logTable[i]['date'] = line.substring(startPos, endPos-9);

      // Match requests
      startPos = line.indexOf('/', endPos);
      endPos = line.indexOf(' ', startPos);
      this.logTable[i]['request'] = line.substring(startPos, endPos);

      // Match http status
      startPos = line.indexOf('" ', endPos) + 2;
      endPos = startPos + 3;
      this.logTable[i]['status'] = line.substring(startPos, endPos);

      // Match bytes
      startPos = endPos + 1;
      endPos = line.indexOf(' ', startPos);

      // If we couldn't find a space after bytes, then assume the line is in
      // Common Log Format. In that case, bytes is the rest of the line, and we
      // can go to the next
      if (endPos === -1) {
        this.logTable[i]['bytes'] = line.substring(startPos);
        this.logTable[i]['referrer'] = "";
        this.logTable[i]['userAgent'] = "";
        continue;
      } else {
        this.logTable[i]['bytes'] = line.substring(startPos, endPos);
      }

      // Otherwise, we're dealing with the Combined Log Format
      // In that case we need referrer and userAgent as well

      // Match ref
      startPos = line.indexOf('"', endPos) + 1;
      endPos = line.indexOf('"', startPos);
      this.logTable[i]['referrer'] = line.substring(startPos, endPos);

      // Match user_agent info
      startPos = line.indexOf('"', endPos + 1) + 1;
      endPos = line.indexOf('"', startPos);
      this.logTable[i]['userAgent'] = line.substring(startPos, endPos);
    }

    // Build individual tables; store top 100 for each
    var n = 100;
    this.hosts       = this.parseHosts(n);
    this.requests    = this.parseRequests(n);
    this.pages       = this.parsePages(n);
    this.referrers   = this.parseReferrers(n);
    this.errors      = this.parseErrors(n);
    this.traffic     = this.parseTraffic();
    this.requests    = this.parseRequests(n);
    this.refDomains  = this.parseRefDomains(n);
  };

  /**
   * Builds a sorted array of objects containing the number of hits and total
   * bandwidth transferred in MB per day. Also takes arguments for filtering the
   * traffic based on a matching criteria.
   *
   * @param   column  The column of the log table to match against
   * @param   match   The string for which to check equality
   * @return  array   Array of objects with: unixTime, date, hits, bandwidth
   */
  this.parseTraffic = function(column, match) {
    var traffic = {};
    var megaByte = 1024 * 1024;
    var bytesTransferred = 0;

    for (var i = 0; i < this.logTable.length; i++) {
      // Filter out hits that don't match our criteria, if given
      if (column && match && !meetsCondition(this.logTable[i], column, match))
          continue;

      var date = Date.parse(this.logTable[i]['date']);
      if (!isNaN(date)) {
        bytesTransferred = parseInt(this.logTable[i]['bytes'], 10);
        dateString = this.logTable[i]['date'];
        // Increment traffic
        if (!traffic[dateString]) {
          traffic[dateString] = { 'unixTime' : date, 'hits': 1,
                                  'bandwidth': isNaN(bytesTransferred) ? 0: bytesTransferred };
        } else {
          traffic[dateString]['hits']++;
          traffic[dateString]['bandwidth'] += isNaN(bytesTransferred) ? 0: bytesTransferred;
        }
      }
    }

    // Add an object for each date, and convert bandwidth to MB
    var output = [];
    for (var key in traffic) {
      traffic[key]['bandwidth'] = (traffic[key]['bandwidth'] / megaByte).toFixed(2);
      traffic[key]['date'] = key;
      output.push(traffic[key]);
    }

    // Sort objects by their unixTime attribute
    function compareTime(a, b) {
      if (a.unixTime < b.unixTime)
         return -1;
      if (a.unixTime > b.unixTime)
        return 1;
      return 0;
    }

    return output.sort(compareTime);
  };

  /**
   * Builds a sorted table, in which each row corresponds to a host and its number
   * of requests. The table is n in size and is in descending order of hits. If
   * column and match are provided, it'll filter rows in logTable by those values.
   *
   * @param   n       Number of top rows to include
   * @param   column  The column of the log table to match against
   * @param   match   The string for which to check equality
   * @return  array   Table with columns [host, hits]
   */
  this.parseHosts = function(n, column, match) {
    var hosts = {};

    for (var i = 0; i < this.logTable.length; i++) {
      // filter out hosts that don't match our criteria
      if (column && match && !meetsCondition(this.logTable[i], column, match))
          continue;

      // Increment host frequency
      if (!hosts[this.logTable[i]['host']])
        hosts[this.logTable[i]['host']] = 1;
      else
        hosts[this.logTable[i]['host']]++;
    }

    return getTopNFromHash(hosts, n);
  };

  /**
   * Builds a sorted table, in which each row contains the request url and the
   * number of occurrences. The table is n in size and is in descending order
   * of hits. If column and match are provided, it'll filter rows in logTable by
   * those values.
   *
   * @param   n       Number of top rows to include
   * @param   column  The column of the log table to match against
   * @param   match   The string for which to check equality
   * @return  array   Table with columns [request, hits]
   */
  this.parseRequests = function(n, column, match) {
    var requests = {};

    for (var i = 0; i < this.logTable.length; i++) {
      // filter out rows that don't match our criteria
      if (column && match && !meetsCondition(this.logTable[i], column, match))
          continue;

      // Increment requests frequency
      if (!requests[this.logTable[i]['request']])
        requests[this.logTable[i]['request']] = 1;
      else
        requests[this.logTable[i]['request']]++;
    }

    return getTopNFromHash(requests, n);
  };

  /**
   * Builds a sorted table, in which each row corresponds to a page and its
   * number of hits. Each request is checked against a list of common media
   * extensions to ensure that it's indeed a page. The query and fragment
   * portions of the URI are also ignored if present. The table is n in size and
   * in descending order of hits. If column and match are provided, it'll filter
   * rows in logTable by those values.
   *
   * @param   n       Number of top rows to include
   * @param   column  The column of the log table to match against
   * @param   match   The string for which to check equality
   * @return  array   Table with columns [page, hits]
   */
  this.parsePages = function(n, column, match) {
    // Helper for ignoring common media file extensions
    function isNotMedia(url) {
      extensions = [
        'jpg', 'jpeg', 'pdf', 'mp3', 'rar', 'exe', 'wmv',  'doc', 'avi', 'ppt',
        'mpg', 'mpeg', 'tif', 'wav', 'psd','txt', 'bmp',  'css', 'js',  'png',
        'gif', 'swf',  'dmg', 'flv', 'gz', 'ico'
      ];
      for (var i = 0; i < extensions.length; i++) {
        if (url.indexOf('.' + extensions[i]) != -1)
          return false;
      }
      return true;
    }

    var pages = {};
    var query;
    var fragment;

    for (var i = 0; i < this.logTable.length; i++) {
      // filter out rows that don't match our criteria
      if (column && match && !meetsCondition(this.logTable[i], column, match))
          continue;

      if (isNotMedia(this.logTable[i]['request'])) {
        var page = removeQueryAndFragment(this.logTable[i]['request']);

        if (!pages[page])
          pages[page] = 1;
        else
          pages[page]++;
      }
    }

    delete pages[''];

    return getTopNFromHash(pages, n);
  };


  /**
   * Builds a sorted table, in which each row corresponds to an http referrer
   * and the number of requests originating from that location. The table is n in
   * size and is in descending order of hits. If column and match are provided,
   * it'll filter rows in logTable by those values.
   *
   * @param   n       Number of top rows to include
   * @param   column  The column of the log table to match against
   * @param   match   The string for which to check equality
   * @return  array   Table with columns [referrer, hits]
   */
  this.parseReferrers = function(n, column, match) {
    var referrers = {};

    for (var i = 0; i < this.logTable.length; i++) {
      // filter out rows that don't match our criteria
      if (column && match && !meetsCondition(this.logTable[i], column, match))
          continue;

      // Increment ref frequency
      if (!referrers[this.logTable[i]['referrer']])
        referrers[this.logTable[i]['referrer']] = 1;
      else
        referrers[this.logTable[i]['referrer']]++;
    }

    // Remove blank referrers from the results
    delete referrers['-'];
    delete referrers[''];

    return getTopNFromHash(referrers, n);
  };

  /**
   * Builds the referring domains table, in which each row corresponds to an
   * external referring domain and its number of requests. The table is N in size
   * and is in descending order. If column and match are provided, it'll filter
   * rows in logTable by those values.
   *
   * @param   n       Number of top rows to include
   * @param   column  The column of the log table to match against
   * @param   match   The string for which to check equality
   * @return  array   Table with columns [referrer, hits]
   */
  this.parseRefDomains = function(n, column, match) {
    var refDomains = {};

    for (var i = 0; i < this.logTable.length; i++) {
      // filter out rows that don't match our criteria
      if (column && match && !meetsCondition(this.logTable[i], column, match))
          continue;

      var refDomain = getDomainFromURL(this.logTable[i]['referrer']);

      // Increment ref domain frequency
      if (!refDomains[refDomain])
        refDomains[refDomain] = 1;
      else
        refDomains[refDomain]++;
    }

    delete refDomains['-'];
    delete refDomains[''];

    // Assume top result is your domain, and we only want external
    var outputTable = getTopNFromHash(refDomains, n);

    return outputTable;
  };

  /**
   * Builds a sorted table, in which each row corresponds to a 404 and its
   * number of requests. The table is n in size and is in descending order of
   * hits. If column and match are provided, it'll filter rows in logTable by
   * those values.
   *
   * @param   n       Number of top rows to include
   * @param   column  The column of the log table to match against
   * @param   match   The string for which to check equality
   * @return  array   Table with columns [request, hits]
   */
  this.parseErrors = function(n, column, match) {
    var errors = {};

    for (var i = 0; i < this.logTable.length; i++) {
      // filter out rows that don't match our criteria
      if (column && match && !meetsCondition(this.logTable[i], column, match))
          continue;

      // Increment error frequency
      if (this.logTable[i]['status'] ==  '404') {
        if (!errors[this.logTable[i]['request']])
          errors[this.logTable[i]['request']] = 1;
        else
          errors[this.logTable[i]['request']]++;
      }
    }

    return getTopNFromHash(errors, n);
  };

}
