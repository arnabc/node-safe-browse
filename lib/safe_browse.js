/*
Copyright (c) 2011 Arnab Chakraborty <arnabc@webgyani.com>

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/


var _       = require('underscore'),
    request = require('request'),
    http    = require('http'),
    url     = require('url'),
    util    = require('util'),
    qs      = require('querystring'),
    EventEmitter = require('events').EventEmitter;


// Number of URLs which can be verified at once
// sending all URLs to google
const MAX_NUMBER_OF_URLS_ALLOWED = 500;
const GOOGLE_SAFE_BROWSE_LOOKUP_URL = 'https://sb-ssl.google.com/safebrowsing/api/lookup';

const Errors = {
    API_KEY_REQUIRED: 'An API key is required to connect to the Google SafeBrowsing API',
    MAX_URLS_ALLOWED: 'Total number of URLs has exceeded the maximum allowed limit of ' + MAX_NUMBER_OF_URLS_ALLOWED,
    INVALID_URL: 'Specified URL is not a valid one. Refer to the documentation for valid URLs',
    NO_URL_TO_LOOKUP: 'No URL to look up, check the supplied list whether it contains valid URLs or not'
};

// @credit http://af-design.com/blog/2008/03/14/rfc-3986-compliant-uri-encoding-in-javascript/
/**
 * Necessary to override the QueryString module's escape() method
 * to make it compliant with RFC-3986. JavaScript's encodeURIComponent()
 * does not percent encode these characters ("!", "*", "(", ")", "'" ), in
 * order to make the escaping compliant with RFC-3986 which has reserved the
 * above mentioned characters, we need to override this method.
 *
 * @param str
 */
qs.escape = function (str) {
    var s =  encodeURIComponent(str);
    s = s.replace('!','%21');
    s = s.replace('*','%2A');
    s = s.replace('(','%28');
    s = s.replace(')','%29');
    s = s.replace("'",'%27');
    return s;
}


/**
 * Custom API Response Error wrapper, which basically adds additional
 * information to the error object.
 * @constructor
 * 
 * @param message - the status text received from the API server
 * @param statusCode - The HTTP status code
 */
function APIResponseError( message, statusCode ) {
    Error.captureStackTrace( this, this.constructor );

    this.message = message;
    this.statusCode = statusCode;
}
util.inherits( APIResponseError, Error );
APIResponseError.prototype.name = 'API Response Error';


 /*
    params = {
        // application version
        appvar: '1.0.0', 

        // protocol version Google SafeBrowsing Lookup API
        pvar: '3.0', 

        // turn on log messages
        debug: false|true, 

        // in case google api url changes in future, this can be used to 
        // fix that problem without modifying anything in the code
        api: 'google safebrowsing api url'
    }

 */

function SafeBrowseApi( apiKey, params ) {
    var GOOGLE_API_URL, DEBUG, log;

    // without API KEY do not proceed
    if( !apiKey ) {
        throw new Error( Errors.API_KEY_REQUIRED );
    }

    // params should be an object
    params = params || {};

    GOOGLE_API_URL = params.api || GOOGLE_SAFE_BROWSE_LOOKUP_URL;
    delete params.api; // remove the API if provided    

    // one can optionally enable debugging
    DEBUG = !!(params.debug);
    delete params.debug;

    // merge specified params with the default one
    params = _.defaults(params, SafeBrowseApi.defaults, { apikey: apiKey });

    // Utility log method
    log =  DEBUG
            ? function () { console.log.apply(console, arguments ); }
            : function (){}

    /**
     * Utility class which encapsulates the implementation for
     * for API request
     * @constructor
     */
    function SafeBrowse() {
    }
           
    /*
     * Utility method to lookup an URL or a set of URLs for malware/phishing safety
     * @param {Array|String} uri
     * @chainable
     */               
    SafeBrowse.prototype.lookup = function ( uri, callback ) {
        var type = 'get'
          , len
          , options = {}
          , qparams = _.clone( params )
          , self = this
          , emitter = new EventEmitter();
        
        // if nothing specified, then bark at the user :-)
        if( !uri ) {
            throw new Error( Errors.INVALID_URL );
        }

        // uri is an array then the request type must be POST
        // in order to send multiple URLs to verify to Google
        if( Array.isArray( uri ) ) {
            type = 'post';

            log( 'Request type: POST' );

            // check max number of urls
            if( uri.length > MAX_NUMBER_OF_URLS_ALLOWED ) {
                throw new Error( Errors.MAX_URLS_ALLOWED );
            }

            // sort the array 
            uri.sort();

            // discard invalid urls
            var parsedUrls = uri.filter( function ( u ) {
                return ( u && isValidURL( u ) ? u : undefined );
            } );

            if( !parsedUrls.length ) {
                throw new Error( Errors.NO_URL_TO_LOOKUP );
            }

            // discard duplicate items
            parsedUrls = _.unique( parsedUrls, true /* isSorted */ );

            // length needs to be sent to the request body
            // as per API requirement
            parsedUrls.unshift( parsedUrls.length );

            options.uri = buildQueryStringURL( qparams );
            options.body = parsedUrls.join( '\n' );

            log( 'Request URI:\n %s', options.uri );
            log( 'Request Body:\n %s', options.body );

            log( 'Total URLs to look up after processing: %d', parsedUrls[0] );
        }


        // GET requests
        if( type == 'get' ) {
            log( 'Request type: GET' );

            // check URL validness
            if( !isValidURL( uri ) ) {
                throw new Error( Errors.INVALID_URL );
            }

            qparams.url = uri;
            options.uri = buildQueryStringURL( qparams );

            log( 'URL to be looked up: %s', options.uri );
        }

        // Make the request
        log( 'Sending request to Google...' );
        request[type]( options, responseCallback );


        // ==== Utility inner functions ====

        /**
         * Utility method to check for URL validity
         * @param u
         */
        function isValidURL( u ) {
            var o = url.parse(u);
            return !!(o.protocol && o.hostname );
        }

        /**
         * Utility method to generate the GET URL for lookup
         * @param u
         * @param params
         */
        function buildQueryStringURL( params ) {
            return ( GOOGLE_API_URL + '?' + qs.stringify( params ) );
        }

        /**
         * Internal callback method for the HTTP Request
         * @param error
         * @param response
         * @param body
         */
        function responseCallback( error, response, body ) {
            var data;

            log('Response Status: %d', response.statusCode );
            log('Raw Response Body: %s', body );

            function callbackOrEvent( event, args ) {
                if( _.isFunction( callback ) ) {
                    if( event == 'error' ) {
                        callback( args );
                    } else {
                        callback( null, args );
                    }
                } else {
                    emitter.emit( event, args );    
                }
            }

            if( error ) {
                return callbackOrEvent( 'error', error );
            }
            
            // the Google Safe Browsing API returns the following response codes
            // for invalid requests which can be considered as Errors
            // 400, 401, 503

            // indexOf uses Strict Matching(===), hence parseInt()
            if( [400, 401, 503 ].indexOf( parseInt( response.statusCode, 10 ) ) > -1 ) {
                return callbackOrEvent( 'error', new APIResponseError(response.statusText, response.statusCode ) );
            } else {
                // assume it's 200 or 204
                data = prepareData( response, body );
                callbackOrEvent( 'success', data );
            }

            log( 'Finished.' );
        }


        /**
         * Utility function to parse the response body. It returns an object literal
         * with the the URLs as key and api response as values, so that it's easier
         * to figure out which url is a bad one.
         *
         * Output:
         *
         * response = { statusCode: HTTP_RESPONSE_CODE, data: {...URLs} }
         *
         * @param response
         * @param body
         */
        function prepareData( response, body ) {
            var statusCode = response.statusCode,
                retVal = {
                    statusCode: statusCode,
                    data: {}
                },
                results;

            if( type == 'get' ) {
                results = 'ok';

                // if 200 then see the response body for the exact type i.e malware|fishing|malware,fishing
                if( statusCode == 200 ) {
                    results = body.replace(/\n|\r\n/, '' );
                }

                retVal['data'][uri] = results;

            } else {
                // the first element in parsedUrls array is the
                // total number of URLs, we need to shift that out
                parsedUrls.shift();

                // NONE of the specified URLs matched, all clean!
                if( statusCode == 204 ) {
                    parsedUrls.forEach( function ( value, index ) {
                        retVal['data'][value] = 'ok';
                    } );
                }
                // AT LEAST ONE of the specified URLs matched
                else {
                    results = body.split('\n');

                    results.forEach( function ( value, index ) {
                        retVal['data'][ parsedUrls[index] ] = value;
                    } );
                }
            }
            return retVal;
        }

        return emitter; // for event binding
    };

    return new SafeBrowse();
}


SafeBrowseApi.defaults = {
    client:  'Node Safe-Browse',
    apikey:  null,
    appver:  '1.0.0', // format = major.minor.patch
    pver:    '3.0' // format = major.minor
};


// export
module.exports.Api = SafeBrowseApi;