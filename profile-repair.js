(() => {
  'use strict';

  function boot() {
    const button = document.getElementById('profileButton');
    if (!button) return;

    let menu = document.getElementById('profileMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'profileMenu';
      menu.className = 'profile-menu hide';
      menu.innerHTML = `
        <div class="profile-menu-inner">
          <div class="profile-menu-head">
            <div class="profile-menu-avatar" id="repairProfileAvatar">🐞</div>
            <div><strong id="repairProfileName">Perfil</strong><small id="repairProfileRole">Conta</small></div>
          </div>
          <button type="button" data-action="profile">👤 Meu perfil</button>
          <button type="button" data-action="friends">👥 Amigos</button>
          <button type="button" data-action="login">🔐 Entrar</button>
          <button type="button" data-action="logout">🚪 Sair</button>
        </div>`;
      document.body.appendChild(menu);
    }

    // Only replace the profile button's own handler. No capture-phase listener,
    // no global click interception, and no changes to other buttons.
    button.onclick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      menu.classList.toggle('hide');
    };

    if (!menu.dataset.repaired) {
      menu.dataset.repaired = '1';
      menu.addEventListener('click', function (event) {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        menu.classList.add('hide');

        const map = {
          profile: ['myProfileButton', 'openProfile'],
          friends: ['friendsButton', 'openFriends'],
          login: ['loginFromMenu', 'openAuthModal'],
          logout: ['logoutButton', 'logout']
        };
        const targets = map[action] || [];
        const id = targets.find(x => document.getElementById(x));
        if (id) {
          document.getElementById(id).click();
          return;
        }
        for (const fn of targets.slice(1)) {
          if (typeof window[fn] === 'function') {
            window[fn]();
            return;
          }
        }
      });
    }

    document.addEventListener('click', function (event) {
      if (!menu.classList.contains('hide') && !menu.contains(event.target) && event.target !== button && !button.contains(event.target)) {
        menu.classList.add('hide');
      }
    });

    try {
      const name = document.getElementById('profileName')?.textContent || window.currentUser?.username || 'Perfil';
      const repairName = document.getElementById('repairProfileName');
      if (repairName) repairName.textContent = name;
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
