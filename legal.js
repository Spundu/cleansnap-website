/**
 * Renders a legal document from the same source the app uses.
 *
 * Until 2026-08-20 this site published its OWN Privacy Policy — a hand-written
 * page that had drifted several versions behind the one the product actually
 * serves. Two documents described the same processing, and the one Apple and
 * Google read is this one, because this is the URL that goes in App Store
 * Connect and Play Console. The other three documents were worse: the footer
 * linked them straight at the JSON API, so a visitor clicking "Terms of
 * Service" got 19 KB of escaped markup.
 *
 * So there is no copy here. The page fetches the active version at load time,
 * which means publishing a new version through `seed-legal` updates the website
 * with no deploy — and makes divergence impossible rather than unlikely.
 */
(function () {
  'use strict';

  var API = 'https://cleaning-app-production.up.railway.app/api/v1/legal/documents/type/';
  var SUPPORT = 'support@cleansnap.co.uk';

  /**
   * Strip anything executable out of the document before it goes in the page.
   *
   * The content is written by us and served by our own API, so this is not the
   * primary defence — it is the one that still holds if an admin account is
   * ever misused. Parsing happens in an inert document, so nothing runs and no
   * image or stylesheet is fetched while we look at it.
   */
  function sanitise(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');

    var dangerous = doc.querySelectorAll('script, style, iframe, object, embed, form, link, meta, base');
    for (var i = 0; i < dangerous.length; i++) {
      dangerous[i].parentNode.removeChild(dangerous[i]);
    }

    var all = doc.body.querySelectorAll('*');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      var attrs = Array.prototype.slice.call(el.attributes);
      for (var k = 0; k < attrs.length; k++) {
        var name = attrs[k].name.toLowerCase();
        var value = attrs[k].value;
        // Event handlers, and any URL that could execute.
        if (name.indexOf('on') === 0) el.removeAttribute(attrs[k].name);
        if ((name === 'href' || name === 'src') && /^\s*(javascript|data|vbscript):/i.test(value)) {
          el.removeAttribute(attrs[k].name);
        }
      }
      // Links out of the document open in a new tab, and cannot reach us back.
      if (el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href').indexOf('mailto:') !== 0) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }

    return doc.body.innerHTML;
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /**
   * What a visitor sees when the API cannot be reached.
   *
   * Never a blank page. These URLs are checked by app reviewers and by people
   * who have just been told their account was suspended; an empty privacy
   * policy is worse than a slow one, so the failure says what happened and
   * gives a route to a human.
   */
  function renderError(target, title, meta) {
    // Clear the "Loading the current version…" line first. Left in place it
    // sits directly above the failure box saying the opposite of it.
    if (meta) meta.textContent = '';

    target.innerHTML =
      '<div class="rounded-xl border border-amber-200 bg-amber-50 p-6">' +
      '<h2 class="text-lg font-semibold text-amber-900 mb-2">' +
      escapeText(title) +
      ' is temporarily unavailable</h2>' +
      '<p class="text-amber-900/80 mb-4">We could not load the current version just now. This is a problem on our side, not yours.</p>' +
      '<p class="text-amber-900/80">Email <a class="font-semibold underline" href="mailto:' +
      SUPPORT +
      '">' +
      SUPPORT +
      '</a> and we will send you a copy. Please try again in a few minutes.</p>' +
      '</div>';
  }

  /**
   * @param {string} type   LegalDocumentType, e.g. TERMS_OF_SERVICE
   * @param {string} title  Human name, used only in the failure message
   */
  window.renderLegalDocument = function (type, title) {
    var target = document.getElementById('legal-content');
    var meta = document.getElementById('legal-meta');
    if (!target) return;

    fetch(API + encodeURIComponent(type), { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        var doc = payload && payload.data;
        if (!doc || !doc.content) throw new Error('no content');

        target.innerHTML = sanitise(doc.content);

        if (meta && doc.version) {
          var published = doc.publishedAt ? new Date(doc.publishedAt) : null;
          meta.textContent =
            'Version ' +
            doc.version +
            (published && !isNaN(published.getTime())
              ? ' — in force since ' +
                published.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
              : '');
        }
      })
      .catch(function () {
        renderError(target, title, meta);
      });
  };
})();
