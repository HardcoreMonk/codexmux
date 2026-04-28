(function () {
  var modal = document.getElementById('archModal');
  if (!modal) return;

  var API = 'https://api.github.com/repos/subicura/codexmux/releases/latest';
  var FALLBACK = 'https://github.com/subicura/codexmux/releases/latest';
  var releasePromise = null;
  var lastFocus = null;

  var openModal = function (trigger) {
    lastFocus = trigger || document.activeElement;
    modal.hidden = false;
    requestAnimationFrame(function () { modal.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
    var firstOption = modal.querySelector('[data-arch]');
    if (firstOption) firstOption.focus();
    prefetchRelease();
  };

  var closeModal = function () {
    modal.classList.remove('is-open');
    setTimeout(function () {
      modal.hidden = true;
      document.body.style.overflow = '';
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }, 180);
  };

  var prefetchRelease = function () {
    if (releasePromise) return releasePromise;
    releasePromise = fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        releasePromise = null;
        throw err;
      });
    return releasePromise;
  };

  var pickAsset = function (assets, arch) {
    for (var i = 0; i < assets.length; i++) {
      var asset = assets[i];
      var name = (asset.name || '').toLowerCase();
      if (!name.endsWith('.dmg')) continue;
      if (arch === 'arm64') {
        if (name.indexOf('arm64') !== -1) return asset;
      } else if (name.indexOf('arm64') === -1) {
        return asset;
      }
    }
    return null;
  };

  var triggerDownload = function (arch) {
    prefetchRelease()
      .then(function (release) {
        var asset = pickAsset(release.assets || [], arch);
        if (!asset || !asset.browser_download_url) throw new Error('no-asset');
        window.location.href = asset.browser_download_url;
      })
      .catch(function () {
        window.open(FALLBACK, '_blank', 'noopener');
      });
  };

  document.querySelectorAll('[data-download-mac]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      openModal(el);
    });
  });

  modal.addEventListener('click', function (e) {
    if (e.target.closest('[data-arch-close]')) { closeModal(); return; }
    var opt = e.target.closest('[data-arch]');
    if (opt) {
      triggerDownload(opt.getAttribute('data-arch'));
      closeModal();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
})();
