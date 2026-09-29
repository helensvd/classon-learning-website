/* ==========================================================================
   Classon Learning — Shopify storefront
   Products and checkout live in Shopify; this file only reads the catalog
   and keeps a cart through the Storefront API. Load it on every page: it adds
   the header cart button and the cart drawer, and fills #shop-grid if the page
   has one (shop.html).

   Managing products (all in Shopify admin → Products):
   - Status Active + published to the "Headless" sales channel = shown here.
   - Product type  → the program it's grouped under (e.g. "Cosmetology").
   - Tag "moq:10"  → minimum order quantity. No tag = minimum of 1.
   - Variant SKU   → shown on the card (e.g. CL-CO-205).
   ========================================================================== */

(function () {
  var CONFIG = {
    shop: 'classonlearning.myshopify.com',
    // Public Storefront API token (Shopify admin → Headless → Storefront API).
    // It is meant to be embedded in client-side code; it can only read the
    // published catalog and build carts.
    token: 'd85b6fa786659dc4f8d89b0d9e982e56',
    apiVersion: '2025-07',
    // Program order on the shop page; product types not listed here go last.
    programs: ['Cosmetology', 'Lash extension', 'Permanent makeup', 'HVAC/R', 'Culinary', 'Uniforms', 'Program merch']
  };

  var CART_KEY = 'classon-cart-id';

  // ---------- Storefront API ------------------------------------------------
  function gql(query, variables) {
    return fetch('https://' + CONFIG.shop + '/api/' + CONFIG.apiVersion + '/graphql.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': CONFIG.token
      },
      body: JSON.stringify({ query: query, variables: variables || {} })
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.errors && json.errors.length) throw new Error(json.errors[0].message);
        return json.data;
      });
  }

  var CART_FIELDS = [
    'id checkoutUrl totalQuantity',
    'cost { subtotalAmount { amount currencyCode } }',
    'lines(first: 100) { nodes {',
    '  id quantity',
    '  cost { totalAmount { amount currencyCode } }',
    '  merchandise { ... on ProductVariant {',
    '    id title sku',
    '    image { url altText }',
    '    product { title tags featuredImage { url altText } }',
    '  } }',
    '} }'
  ].join('\n');

  function cartMutation(name, args, variables) {
    var q = 'mutation(' + args + ') { ' + name + ' { cart { ' + CART_FIELDS + ' } userErrors { message } } }';
    return gql(q, variables).then(function (data) {
      var result = data[name.split('(')[0]];
      if (result.userErrors && result.userErrors.length) throw new Error(result.userErrors[0].message);
      return result.cart;
    });
  }

  var api = {
    products: function () {
      return gql([
        '{ products(first: 100, sortKey: TITLE) { nodes {',
        '  id title handle description productType tags availableForSale',
        '  featuredImage { url altText }',
        '  variants(first: 1) { nodes { id sku availableForSale price { amount currencyCode } } }',
        '} } }'
      ].join('\n')).then(function (d) { return d.products.nodes; });
    },
    getCart: function (id) {
      return gql('query($id: ID!) { cart(id: $id) { ' + CART_FIELDS + ' } }', { id: id })
        .then(function (d) { return d.cart; });
    },
    createCart: function (lines) {
      return cartMutation('cartCreate(input: { lines: $lines })', '$lines: [CartLineInput!]', { lines: lines });
    },
    addLines: function (cartId, lines) {
      return cartMutation('cartLinesAdd(cartId: $cartId, lines: $lines)', '$cartId: ID!, $lines: [CartLineInput!]!', { cartId: cartId, lines: lines });
    },
    updateLine: function (cartId, lineId, quantity) {
      return cartMutation('cartLinesUpdate(cartId: $cartId, lines: $lines)', '$cartId: ID!, $lines: [CartLineUpdateInput!]!',
        { cartId: cartId, lines: [{ id: lineId, quantity: quantity }] });
    },
    removeLine: function (cartId, lineId) {
      return cartMutation('cartLinesRemove(cartId: $cartId, lineIds: $lineIds)', '$cartId: ID!, $lineIds: [ID!]!',
        { cartId: cartId, lineIds: [lineId] });
    }
  };

  // ---------- helpers -------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(m) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currencyCode }).format(Number(m.amount));
  }

  function moqOf(tags) {
    for (var i = 0; i < (tags || []).length; i++) {
      var m = /^moq:\s*(\d+)$/i.exec(tags[i]);
      if (m) return Math.max(1, parseInt(m[1], 10));
    }
    return 1;
  }

  function sized(url, w) { return url + (url.indexOf('?') < 0 ? '?' : '&') + 'width=' + w; }

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function storedCartId() { try { return localStorage.getItem(CART_KEY); } catch (e) { return null; } }
  function storeCartId(id) { try { id ? localStorage.setItem(CART_KEY, id) : localStorage.removeItem(CART_KEY); } catch (e) {} }

  // ---------- cart state ----------------------------------------------------
  var cart = null;
  var busy = false;

  function loadCart() {
    var id = storedCartId();
    if (!id) return Promise.resolve(null);
    return api.getCart(id).then(function (c) {
      // Shopify drops carts after checkout completes or after they expire.
      if (!c) storeCartId(null);
      return c;
    }).catch(function () { return null; });
  }

  function setCart(c) {
    cart = c;
    storeCartId(c ? c.id : null);
    renderCart();
  }

  function withBusy(promise) {
    busy = true;
    drawer.classList.add('is-busy');
    return promise
      .then(setCart)
      .catch(function (err) { showCartError(err.message); throw err; })
      .finally(function () { busy = false; drawer.classList.remove('is-busy'); });
  }

  function addToCart(variantId, quantity) {
    var lines = [{ merchandiseId: variantId, quantity: quantity }];
    var p = cart ? api.addLines(cart.id, lines) : api.createCart(lines);
    return withBusy(p).then(openDrawer);
  }

  // ---------- header button + drawer ---------------------------------------
  var headerBtn, drawer, scrim, lastFocus;

  function mountChrome() {
    var top = document.querySelector('.top-in');
    if (top) {
      headerBtn = document.createElement('button');
      headerBtn.type = 'button';
      headerBtn.className = 'cart-btn';
      headerBtn.setAttribute('aria-haspopup', 'dialog');
      headerBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L20.5 8H6.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.3" fill="currentColor"/><circle cx="17" cy="20" r="1.3" fill="currentColor"/></svg><span>Cart</span><span class="cart-count" hidden>0</span>';
      headerBtn.addEventListener('click', openDrawer);
      var cta = top.querySelector('.btn');
      var actions = document.createElement('div');
      actions.className = 'top-actions';
      top.insertBefore(actions, cta || null);
      actions.appendChild(headerBtn);
      if (cta) actions.appendChild(cta);
    }

    scrim = document.createElement('div');
    scrim.className = 'cart-scrim';
    scrim.addEventListener('click', closeDrawer);

    drawer = document.createElement('aside');
    drawer.className = 'cart-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'cart-title');
    drawer.setAttribute('tabindex', '-1');
    drawer.innerHTML =
      '<div class="cart-head"><h2 id="cart-title">Your order</h2>' +
      '<button type="button" class="cart-close" aria-label="Close cart">&times;</button></div>' +
      '<div class="cart-error" role="alert" hidden></div>' +
      '<div class="cart-body"></div>' +
      '<div class="cart-foot"></div>';
    drawer.querySelector('.cart-close').addEventListener('click', closeDrawer);
    drawer.addEventListener('click', onDrawerClick);

    document.body.appendChild(scrim);
    document.body.appendChild(drawer);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('cart-open')) closeDrawer();
    });
  }

  function openDrawer() {
    lastFocus = document.activeElement;
    document.body.classList.add('cart-open');
    drawer.focus();
  }

  function closeDrawer() {
    document.body.classList.remove('cart-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function showCartError(msg) {
    var box = drawer.querySelector('.cart-error');
    box.textContent = msg ? 'Something went wrong: ' + msg : '';
    box.hidden = !msg;
  }

  function renderCart() {
    showCartError(null);
    var count = cart ? cart.totalQuantity : 0;
    if (headerBtn) {
      var badge = headerBtn.querySelector('.cart-count');
      badge.textContent = count;
      badge.hidden = !count;
      headerBtn.setAttribute('aria-label', 'Cart, ' + count + (count === 1 ? ' item' : ' items'));
    }

    var body = drawer.querySelector('.cart-body');
    var foot = drawer.querySelector('.cart-foot');
    var lines = cart ? cart.lines.nodes : [];

    if (!lines.length) {
      body.innerHTML = '<p class="cart-empty">Nothing here yet. Standard kits can be ordered directly from the <a href="shop.html">shop</a>.</p>';
      foot.innerHTML = '';
      return;
    }

    body.innerHTML = lines.map(function (line) {
      var v = line.merchandise;
      var img = v.image || v.product.featuredImage;
      var moq = moqOf(v.product.tags);
      return '<div class="cart-line" data-line="' + esc(line.id) + '" data-qty="' + line.quantity + '" data-moq="' + moq + '">' +
        (img ? '<img src="' + esc(sized(img.url, 160)) + '" alt="">' : '<span class="cart-thumb" aria-hidden="true"></span>') +
        '<div class="cart-line-main">' +
          '<p class="cart-line-title">' + esc(v.product.title) + '</p>' +
          (v.sku ? '<p class="cart-line-sku">' + esc(v.sku) + (moq > 1 ? ' · min ' + moq : '') + '</p>' : '') +
          '<div class="qty qty-sm">' +
            '<button type="button" data-act="dec" aria-label="Decrease quantity"' + (line.quantity <= moq ? ' disabled' : '') + '>&minus;</button>' +
            '<span aria-live="polite">' + line.quantity + '</span>' +
            '<button type="button" data-act="inc" aria-label="Increase quantity">+</button>' +
          '</div>' +
        '</div>' +
        '<div class="cart-line-side">' +
          '<p class="cart-line-price">' + money(line.cost.totalAmount) + '</p>' +
          '<button type="button" class="cart-remove" data-act="remove">Remove</button>' +
        '</div>' +
      '</div>';
    }).join('');

    foot.innerHTML =
      '<div class="cart-subtotal"><span>Subtotal</span><strong>' + money(cart.cost.subtotalAmount) + '</strong></div>' +
      '<p class="cart-note">Shipping and taxes are calculated at checkout.</p>' +
      '<a class="btn btn-solid cart-checkout" href="' + esc(cart.checkoutUrl) + '">Checkout</a>' +
      '<p class="cart-note">Ordering every term? <a href="contact.html#form">Ask for a supply agreement</a> with fixed pricing and scheduled delivery.</p>';
  }

  function onDrawerClick(e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn || busy || !cart) return;
    var row = btn.closest('.cart-line');
    var id = row.getAttribute('data-line');
    var qty = parseInt(row.getAttribute('data-qty'), 10);
    var moq = parseInt(row.getAttribute('data-moq'), 10);
    var act = btn.getAttribute('data-act');

    if (act === 'remove') withBusy(api.removeLine(cart.id, id));
    else if (act === 'inc') withBusy(api.updateLine(cart.id, id, qty + 1));
    else if (act === 'dec' && qty > moq) withBusy(api.updateLine(cart.id, id, qty - 1));
  }

  // ---------- shop page -----------------------------------------------------
  function renderShop(grid) {
    grid.innerHTML = '<p class="shop-status">Loading kits…</p>';

    api.products().then(function (products) {
      products = products.filter(function (p) { return p.variants.nodes.length; });
      if (!products.length) {
        grid.innerHTML = '<p class="shop-status">No kits are listed for direct order right now. <a href="contact.html#form">Request a proposal</a> instead.</p>';
        return;
      }

      var groups = {};
      products.forEach(function (p) {
        var key = p.productType || 'Other kits';
        (groups[key] = groups[key] || []).push(p);
      });
      var order = Object.keys(groups).sort(function (a, b) {
        var ia = CONFIG.programs.indexOf(a), ib = CONFIG.programs.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      });

      var chips = document.getElementById('shop-chips');
      if (chips) {
        chips.innerHTML = order.map(function (g) {
          return '<a href="#shop-' + slug(g) + '">' + esc(g) + '</a>';
        }).join('');
      }

      grid.innerHTML = order.map(function (g) {
        return '<section class="prog" id="shop-' + slug(g) + '">' +
          '<h2 class="shop-prog">' + esc(g) + '</h2>' +
          '<div class="kits">' + groups[g].map(productCard).join('') + '</div>' +
        '</section>';
      }).join('');
    }).catch(function (err) {
      grid.innerHTML = '<p class="shop-status">The shop could not load (' + esc(err.message) + '). Email <a href="mailto:sales@classonlearning.com">sales@classonlearning.com</a> to order.</p>';
    });

    grid.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var card = btn.closest('.kit');
      var out = card.querySelector('.qty span');
      var qty = parseInt(out.textContent, 10);
      var moq = parseInt(card.getAttribute('data-moq'), 10);

      if (btn.hasAttribute('data-step')) {
        qty = Math.max(moq, qty + parseInt(btn.getAttribute('data-step'), 10));
        out.textContent = qty;
        card.querySelector('[data-step="-1"]').disabled = qty <= moq;
      } else if (btn.classList.contains('kit-add') && !busy) {
        btn.disabled = true;
        btn.textContent = 'Adding…';
        addToCart(card.getAttribute('data-variant'), qty)
          .catch(function () { openDrawer(); })
          .finally(function () { btn.disabled = false; btn.textContent = 'Add to order'; });
      }
    });
  }

  function productCard(p) {
    var v = p.variants.nodes[0];
    var moq = moqOf(p.tags);
    var img = p.featuredImage;
    var available = p.availableForSale && v.availableForSale;
    return '<article class="kit" data-variant="' + esc(v.id) + '" data-moq="' + moq + '">' +
      '<div class="kit-photo">' +
        (img ? '<img loading="lazy" src="' + esc(sized(img.url, 900)) + '" alt="' + esc(img.altText || p.title) + '">'
             : '<div class="kit-ph" aria-hidden="true"><span>' + esc(p.productType || 'Kit') + '</span></div>') +
      '</div>' +
      '<div class="kit-body">' +
        '<h3>' + esc(p.title) + '</h3>' +
        '<p>' + esc(p.description) + '</p>' +
        '<p class="kit-price">' + money(v.price) + ' <span>per kit</span></p>' +
      '</div>' +
      '<div class="kit-buy">' +
        (available
          ? '<div class="qty" aria-label="Quantity">' +
              '<button type="button" data-step="-1" aria-label="Decrease quantity" disabled>&minus;</button>' +
              '<span aria-live="polite">' + moq + '</span>' +
              '<button type="button" data-step="1" aria-label="Increase quantity">+</button>' +
            '</div>' +
            '<button type="button" class="btn btn-solid kit-add">Add to order</button>'
          : '<p class="kit-soldout">Currently unavailable — <a href="contact.html#form">ask us</a></p>') +
      '</div>' +
      '<div class="kit-meta"><span>' + (moq > 1 ? 'Minimum ' + moq + ' kits' : 'No minimum') + '</span>' +
        (v.sku ? '<span class="sku">' + esc(v.sku) + '</span>' : '') + '</div>' +
      '<a class="kit-proposal" href="contact.html?kit=' + encodeURIComponent(v.sku || p.title) + '#form">Need this every term? Request a proposal &rarr;</a>' +
    '</article>';
  }

  // ---------- boot ----------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    mountChrome();
    renderCart();
    loadCart().then(function (c) { if (c) setCart(c); });

    var grid = document.getElementById('shop-grid');
    if (grid) renderShop(grid);
  });
})();
