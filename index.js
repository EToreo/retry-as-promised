var debug = require('debug')('retry-as-promised')
  , error = require('debug')('retry-as-promised:error')
  , Promise = require('bluebird');

module.exports = function(callback, options) {
  if (!callback || !options) throw new Error('retry-as-promised must be passed a callback and a options set or a number');

  if (typeof options === 'number') {
    options = {max: options};
  }

  // Super cheap clone
  options = {
    $current: options.$current || 1,
    max: options.max,
    timeout: options.timeout || undefined,
    match: options.match || [],
    backoffBase: options.backoffBase === undefined ? 100 : options.backoffBase,
    backoffExponent: options.backoffExponent || 1.1
  };
  
  // Massage match option into array so we can blindly treat it as such later
  if (!Array.isArray(options.match)) options.match = [options.match];

  debug('Trying '+callback.name+' (%s)', options.$current);


  return new Promise(function (resolve, reject) {
    var timeout, backoffTimeout;
    if (options.timeout) {
      timeout = setTimeout(function () {
        if (backoffTimeout) clearTimeout(backoffTimeout);
        reject(Promise.TimeoutError(callback.name + ' timed out'));
      }, options.timeout);
    }

    Promise.resolve(callback()).then(resolve).tap(function () {
      if (timeout) clearTimeout(timeout);
      if (backoffTimeout) clearTimeout(backoffTimeout);
    }).catch(function (err) {
      if (timeout) clearTimeout(timeout);
      if (backoffTimeout) clearTimeout(backoffTimeout);

      error(err && err.toString() || err);
      
      // Check if we have retried the max number of times
      if (options.$current === options.max) return reject(err);
      
      // Only continue retrying if match is zero length, or we find a match
      var continueTrying = options.match.length === 0;
      options.match.forEach(function(match) {
        if (typeof match === "string" && match === err.toString())
          continueTrying = true;
        else if (err instanceof Error && match === err.message)
          continueTrying = true;
        else if (typeof match !== "string" && err instanceof match)
          continueTrying = true;
      });
      if (!continueTrying) return reject(err);

      // Do some accounting
      options.$current++;
      
      if (options.backoffBase) {
        // Use backoff function to ease retry rate
        options.backoffBase = Math.pow(options.backoffBase, options.backoffExponent);
        debug('Delay set to %s', options.backoffBase);
        backoffTimeout = setTimeout(function() {
          module.exports(callback, options).then(resolve).catch(reject);
        }, options.backoffBase);
      } else {
        // Just retry with no delay
        debug('Delay not in use');
        module.exports(callback, options).then(resolve).catch(reject);
      }

    });
  });
};

