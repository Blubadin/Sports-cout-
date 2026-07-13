(function() {
  function getAppVersion() {
    var versionMeta = document.querySelector('meta[name="sportscout-app-version"]');
    return versionMeta && versionMeta.getAttribute('content') || 'unknown';
  }

  function readIndexedDbProjects() {
    return new Promise(function(resolve) {
      if (!window.indexedDB) {
        resolve({ value: undefined, failed: true });
        return;
      }

      var settled = false;
      function finish(value, failed) {
        if (settled) return;
        settled = true;
        resolve({ value: value, failed: failed });
      }

      var openRequest;
      try {
        openRequest = window.indexedDB.open('keyval-store');
      } catch (error) {
        finish(undefined, true);
        return;
      }

      openRequest.onupgradeneeded = function() {
        // The default idb-keyval database did not exist, so abort rather than create it.
        if (openRequest.transaction) openRequest.transaction.abort();
        finish(undefined, false);
      };
      openRequest.onerror = function() { finish(undefined, true); };
      openRequest.onblocked = function() { finish(undefined, true); };
      openRequest.onsuccess = function() {
        var database = openRequest.result;
        if (!database.objectStoreNames.contains('keyval')) {
          database.close();
          finish(undefined, false);
          return;
        }

        var transaction;
        try {
          transaction = database.transaction('keyval', 'readonly');
          var getRequest = transaction.objectStore('keyval').get('scout-projects:v1.1');
          getRequest.onsuccess = function() {
            database.close();
            finish(getRequest.result, false);
          };
          getRequest.onerror = function() {
            database.close();
            finish(undefined, true);
          };
        } catch (error) {
          database.close();
          finish(undefined, true);
        }
      };
    });
  }

  function showBackupStatus(container, message) {
    var status = document.getElementById('runtime-recovery-status');
    if (!status) {
      status = document.createElement('p');
      status.id = 'runtime-recovery-status';
      status.style.cssText = 'font-size: 11px; margin: 12px 0 0; color: #b91c1c;';
      container.appendChild(status);
    }
    status.textContent = message;
  }

  async function exportRuntimeRecovery() {
    var snapshot = {};
    for (var index = 0; index < localStorage.length; index += 1) {
      var key = localStorage.key(index);
      if (key) snapshot[key] = localStorage.getItem(key);
    }

    var indexedDbResult = await readIndexedDbProjects();
    var backup = {
      schemaVersion: '1.1',
      app: 'SPORTSCOUT',
      appVersion: getAppVersion(),
      type: 'localStorageRecovery',
      exportedAt: new Date().toISOString(),
      localStorage: snapshot
    };
    if (indexedDbResult.value !== undefined) backup.indexedDbProjects = indexedDbResult.value;

    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'sports_scout_runtime_recovery.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return indexedDbResult.failed;
  }

  function renderErrorOverlay(title, message, detail, extra) {
    var root = document.getElementById('root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'root-fallback';
      document.body.appendChild(root);
    }

    var existing = document.getElementById('debug-error-panel');
    if (existing) {
      var content = existing.querySelector('.details-container');
      if (content) {
        var hr = document.createElement('hr');
        hr.style.cssText = 'border-color: #fca5a5; margin: 12px 0;';
        content.appendChild(hr);

        var p = document.createElement('p');
        p.style.cssText = 'font-weight: 600; font-size: 14px; margin: 6px 0;';
        p.textContent = title + ': ' + message;
        content.appendChild(p);

        if (detail) {
          var pre = document.createElement('pre');
          pre.style.cssText = 'white-space: pre-wrap; font-size: 11px; color: #7f1d1d; background: #fef2f2; padding: 8px; border-radius: 6px; border: 1px solid #fecaca; max-height: 150px; overflow: auto;';
          pre.textContent = detail;
          content.appendChild(pre);
        }
      }
      return;
    }

    // Build DOM safely instead of innerHTML
    var panel = document.createElement('div');
    panel.id = 'debug-error-panel';
    panel.style.cssText = 'padding: 24px; background: #fee2e2; color: #991b1b; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; border: 2px solid #ef4444; border-radius: 12px; margin: 24px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); z-index: 999999; position: relative;';

    var h3 = document.createElement('h3');
    h3.style.cssText = 'margin-top: 0; font-size: 18px; font-weight: 700; color: #7f1d1d; border-bottom: 2px solid #fca5a5; padding-bottom: 8px; display: flex; align-items: center; justify-content: space-between;';
    var titleSpan = document.createElement('span');
    titleSpan.textContent = '\u26a0\ufe0f Critical Runtime Issue Detected';
    h3.appendChild(titleSpan);
    panel.appendChild(h3);

    var detailsDiv = document.createElement('div');
    detailsDiv.className = 'details-container';

    var titleP = document.createElement('p');
    titleP.style.cssText = 'font-weight: 600; font-size: 14px; margin: 12px 0;';
    titleP.textContent = title + ': ' + message;
    detailsDiv.appendChild(titleP);

    var detailPre = document.createElement('pre');
    detailPre.style.cssText = 'white-space: pre-wrap; font-size: 12px; color: #7f1d1d; background: #fef2f2; padding: 12px; border-radius: 6px; border: 1px solid #fecaca; max-height: 250px; overflow: auto; line-height: 1.5;';
    detailPre.textContent = detail || 'No stack trace available';
    detailsDiv.appendChild(detailPre);

    if (extra) {
      var extraP = document.createElement('p');
      extraP.style.cssText = 'font-size: 11px; margin-top: 12px; color: #b91c1c;';
      extraP.textContent = extra;
      detailsDiv.appendChild(extraP);
    }
    panel.appendChild(detailsDiv);

    var btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;';

    var exportBtn = document.createElement('button');
    exportBtn.style.cssText = 'padding: 10px 20px; background: #0f766e; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 13px;';
    exportBtn.textContent = 'Export Local Backup';
    exportBtn.addEventListener('click', async function() {
      var indexedDbReadFailed = await exportRuntimeRecovery();
      showBackupStatus(
        detailsDiv,
        indexedDbReadFailed
          ? 'Exported localStorage backup. IndexedDB project data could not be read.'
          : 'Recovery backup exported.'
      );
    });
    btnContainer.appendChild(exportBtn);

    var reloadBtn = document.createElement('button');
    reloadBtn.style.cssText = 'padding: 10px 20px; background: #475569; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 13px;';
    reloadBtn.textContent = '\ud83d\udd04 Hard Reload';
    reloadBtn.addEventListener('click', function() { window.location.reload(); });
    btnContainer.appendChild(reloadBtn);

    var swBtn = document.createElement('button');
    swBtn.style.cssText = 'padding: 10px 20px; background: #0284c7; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 13px;';
    swBtn.textContent = '\u2699\ufe0f Unregister SW & Reload';
    swBtn.addEventListener('click', function() {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        regs.forEach(function(r) { r.unregister(); });
        location.reload();
      });
    });
    btnContainer.appendChild(swBtn);

    panel.appendChild(btnContainer);
    root.appendChild(panel);
  }

  // 1. Capture unhandled runtime exceptions
  window.addEventListener('error', function(e) {
    if (e.target && (e.target.src || e.target.href)) {
      var resourceUrl = e.target.src || e.target.href;
      var tagName = (e.target.tagName || '').toLowerCase();

      if (tagName === 'img' || tagName === 'video' || tagName === 'audio' || tagName === 'source') return;
      if (
        resourceUrl.indexOf('youtube.com') !== -1 ||
        resourceUrl.indexOf('youtube-nocookie.com') !== -1 ||
        resourceUrl.indexOf('s.ytimg.com') !== -1 ||
        resourceUrl.indexOf('google.com') !== -1 ||
        resourceUrl.indexOf('googleapis.com') !== -1 ||
        resourceUrl.indexOf('gstatic.com') !== -1
      ) return;

      var isRelativeOrOwnOrigin = resourceUrl.indexOf('http') !== 0 || resourceUrl.indexOf(window.location.origin) === 0;
      if (!isRelativeOrOwnOrigin) return;

      renderErrorOverlay(
        'Resource Load Failure',
        'Failed to load asset: ' + resourceUrl,
        'Tag name: <' + tagName + '>\nThis might be due to an incorrect build path, a stale cache, or blocked iframe requests.',
        'Source: ' + window.location.href
      );
    } else {
      renderErrorOverlay(
        'Uncaught Exception',
        e.message || 'Unknown Javascript Error',
        e.error && e.error.stack ? e.error.stack : 'No stack trace available',
        'Filename: ' + e.filename + ' | Line: ' + e.lineno + ':' + e.colno
      );
    }
  }, true);

  // 2. Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason || {};
    var msg = reason.message || String(reason);
    var stack = reason.stack || 'No stack trace available';
    renderErrorOverlay(
      'Unhandled Promise Rejection',
      msg,
      stack,
      'Occurred inside asynchronous execution (Promise)'
    );
  });

  // 3. Intercept console.error for fatal React crashes
  var originalConsoleError = console.error;
  console.error = function() {
    originalConsoleError.apply(console, arguments);
    var args = Array.prototype.slice.call(arguments);
    var message = args.map(function(arg) {
      if (arg instanceof Error) return arg.message;
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); } catch(e) { return String(arg); }
      }
      return String(arg);
    }).join(' ');

    if (
      message.indexOf('benign') !== -1 ||
      message.indexOf('play/pause DOMException') !== -1 ||
      message.indexOf('YouTube') !== -1 ||
      message.indexOf('YT') !== -1 ||
      message.indexOf('Widget') !== -1
    ) return;

    if (
      message.indexOf('Minified React error') !== -1 ||
      message.indexOf('React will try to recreate') !== -1 ||
      message.indexOf('Invariant Violation') !== -1 ||
      message.indexOf('uncaught exception') !== -1
    ) {
      renderErrorOverlay(
        'Fatal React Render Exception',
        message,
        'Look at browser developer console for the complete log structure.'
      );
    }
  };
})();
