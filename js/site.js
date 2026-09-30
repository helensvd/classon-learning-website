/* ==========================================================================
   Classon Learning — booking links and the quote form
   Everything that may change later lives in CONFIG.
   ========================================================================== */

(function () {
  var CONFIG = {
    // Paste the Calendly link here when it exists. Until then, "Book a call"
    // opens an email asking for a time.
    bookingUrl: '',
    salesEmail: 'sales@classonlearning.com',
    // FormSubmit forwards each quote request to salesEmail. The first real
    // submission sends a one-time activation email to that inbox.
    formEndpoint: 'https://formsubmit.co/ajax/sales@classonlearning.com'
  };

  function mailto(subject, body) {
    return 'mailto:' + CONFIG.salesEmail + '?subject=' + encodeURIComponent(subject) +
      (body ? '&body=' + encodeURIComponent(body) : '');
  }

  document.addEventListener('DOMContentLoaded', function () {
    // "Book a call" buttons
    document.querySelectorAll('[data-book]').forEach(function (a) {
      if (CONFIG.bookingUrl) {
        a.href = CONFIG.bookingUrl;
        a.target = '_blank';
        a.rel = 'noopener';
      } else {
        a.href = mailto('Book a call with Classon Learning',
          'Hello Classon team,\n\nWe would like to book a 20-minute call. Times that work for us:\n\n');
      }
    });

    var form = document.getElementById('quote-form');
    if (!form) return;

    // Prefill from links like contact.html?category=Barbering#form
    var params = new URLSearchParams(window.location.search);
    var category = params.get('category');
    var select = form.querySelector('[name="category"]');
    if (category && select) {
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === category) select.selectedIndex = i;
      }
    }

    var confirmBox = document.getElementById('quote-confirm');
    var button = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = String(v).trim(); });
      if (data._honey) return;

      data._subject = 'Quote request — ' + (data.category || 'kits') + ' — ' + (data.school || data.email);
      data._template = 'table';
      data._replyto = data.email;

      button.disabled = true;
      button.textContent = 'Sending…';

      fetch(CONFIG.formEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
        .then(function () {
          form.reset();
          form.hidden = true;
          confirmBox.classList.add('show');
          confirmBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        })
        .catch(function () {
          // Fall back to the visitor's own mail app so the request is never lost.
          var lines = Object.keys(data).filter(function (k) { return k.charAt(0) !== '_' && data[k]; })
            .map(function (k) { return k + ': ' + data[k]; });
          window.location.href = mailto(data._subject, lines.join('\n'));
        })
        .finally(function () {
          button.disabled = false;
          button.textContent = 'Send quote request';
        });
    });
  });
})();
