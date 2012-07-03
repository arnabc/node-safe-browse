Node Safe Browse -- Utility module to check URLs against Google's SafeBrowsing Lookup API
================

The SafeBrowsing Lookup API allows applications to check malicious URLs against Google's constantly updated list of malware and phishing websites/pages.


Install
---------

Using `npm`

<pre>
  npm install safe-browse
</pre>

or from source

<pre>
  git clone git://github.com/arnabc/node-safe-browse.git
  cd node-safe-browse
  npm link
</pre>

Usage
----------

In order to use the module you need to sign up for an `API_KEY` from Google [SafeBrowsing key signup](http://www.google.com/safebrowsing/key_signup.html).


```javascript
// initialize
SafeBrowse = require('safe-browse');
var api = new SafeBrowse.Api( API_KEY, options /* optional */ );
```

By default the `lookup()` method returns an `EventEmitter` object which you can use to bind to `success` and `error` events respectively.

```javascript
api.lookup('http://twitter.com')
    .on( 'success', function ( data ) {
	    // handle success
    } )
    .on( 'error', function ( error ) {
	    // handle error
    } );
```

or you can also use a `callback function` as the second argument like this:

```javascript
api.lookup(['http://twitter.com', 'http://gumblar.cn'], function ( error, data ) {
	// handle data
} );
```

#### SafeBrowse Options

* `appver` - Optional, the version number of the application, default is the version number of the `safe-browse` module.
* `pvar` - Google SafeBrowsing API protocol version, you can change this if Google updates their protocol version number. The current version is `3.0`.
* `debug` - Debug flag (Boolean), enabling this will output some helppful logging messages in `Console`.
* `api` - The URL of the Google SafeBrowsing API, in case it changes you can use the new API url to initialize the module without changing anything in the module code.


Response Handling
-----------------

In case of `success` the result data contains a map with the specified URL as the _key_ and corresponding result text as the value (as received from the API).

```javascript
api.lookup('http://google.com')

// will have the output like below:
{
	statusCode: 204,
	data: {
		'http://google.com': 'ok' // it could be anything like ok|malware|phishing|phishing,malware
	}
}
```

For multiple requests

To check multiple requests at once, provide an array of _valid_ URLs to the `lookup()` method.

```javascript
api.lookup(['http://google.com', 'http://gumblar.cn'])

// will have the output like below:
{
	statusCode: 200,
	data: {
		'http://google.com': 'ok',
		'http://gumblar.cn': 'malware'
	}
}
```

Response Status Codes
-----------------

The following are the HTTP status codes that Google SafeBrowsing Lookup API returns for GET or POST request:

#### GET Requests

* `200` - The queried URL is either phishing, malware or both, see the response body for the specific type.
* `204` - The requested URL is legitimate, no response body returned.
* `400` - Bad Request — The HTTP request was not correctly formed.
* `401` - Not Authorized — The apikey is not authorized.
* `503` - Service Unavailable — The server cannot handle the request. Besides the normal server failures, it could also indicate that the client has been **throttled** by sending too many requests.

Possible reasons for the Bad Request (HTTP code 400):

* Not all the required CGI parameters are specified
* Some of the CGI parameters are empty
* The queried URL is not a valid URL or not properly encoded

Be sure to check against `503`, if you get that back off for sometime (the documentation does not specify whether to exponentially back-off or not) and retry again.

#### POST Requests

If you provide multiple URLs to check against the SafeBrowsing API, `safe-browse` module automatically uses HTTP POST. The maximum number of URLs that you can check at once is `500`.

* `200` - AT LEAST ONE of the queried URLs are matched in either the phishing or malware lists, the actual results are returned through the response body.
* `204` - NONE of the queried URLs matched the phishing or malware lists, no response body returned.
* `400` - Bad Request — The HTTP request was not correctly formed.
* `401` - Not Authorized — The apikey is not authorized.
* `503` - Service Unavailable — The server cannot handle the request. Besides the normal server failures, it could also indicate that the client has been **throttled** by sending too many requests.


Possible reasons for the Bad Request (HTTP code 400):

* Not all the required CGI parameters are specified.
* Some of the CGI parameters are empty.
* Fail to specify the number of URLs in the first line of request body.
* The number of URLs specified in the first line does not match the actual number of URLs specified in the subsequent lines.
* At least one of the queried URL is not a valid URL or not properly encoded.


Error Handling
---------------

If the response status of the request is one of `400`, `401` and `503` then the module fires the `error` event and the error object contains the `statusCode` property with the value of the received HTTP status code. Take a look at the following example:

```javascript
api = new SafeBrowse.API( 'INVALID_API_KEY' );
api.lookup('htp://www.example.com')
	.on( 'error', function ( error ) {
		// the HTTP status text returned by the API
		console.log( error.message );
		// the HTTP status code returned by the API
		console.log( error.statusCode ); // 401 - Not authorized
	} );
```

About
-----
If you have a question then please file an issue or find me on the Twitter [@arnabc](http://twitter.com/arnabc).

License
--------

MIT License. Copyright 2012 Arnab Chakraborty. http://arnab.ch
