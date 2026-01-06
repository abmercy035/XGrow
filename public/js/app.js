const app = {
  user: null,
  currentView: 'boards',

  init: async () => {
    try {
      // Check session
      const res = await fetch('/auth/me');
      if (!res.ok) throw new Error('Unauthorized');
      app.user = await res.json();

      const verifiedBadge = app.user.isVerified ?
        '<i data-lucide="badge-check" style="width: 16px; height: 16px; color: #1d9bf0; fill: #1d9bf0; stroke: #fff;"></i>' : '';

      document.getElementById('header-username').innerHTML = '@' + app.user.username + ' ' + verifiedBadge;

      // Admin Sidebar Link
      if (app.user.isAdmin) {
        const sidebar = document.querySelector('.sidebar');
        const lastItem = sidebar.querySelector('div[style*="margin-top: auto"]');
        const adminLink = document.createElement('div');
        adminLink.className = 'sidebar-item';
        adminLink.onclick = () => app.switchView('admin');
        adminLink.innerHTML = '<i data-lucide="shield-alert" style="width: 18px; height: 18px;"></i> Admin';
        sidebar.insertBefore(adminLink, lastItem);
      }

      app.updateMetrics();
      app.renderPromotedCard();

      // Check payment params
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('payment') === 'success') app.showToast('✅ Upgrade Successful!', 'success');

      await app.loadBoards();

      // Show Upgrade CTA for non-Pro users
      if (!app.user.isPro) {
        const upgradeCta = document.getElementById('upgrade-cta');
        if (upgradeCta) {
          upgradeCta.style.display = 'block';
          const left = 3 - (app.user.generationCount || 0);
          document.getElementById('generations-left').textContent = Math.max(0, left);
        }
      }

      // Initialize Lucide icons
      lucide.createIcons();
    } catch (e) {
      window.location.href = '/login.html';
    }
  },

  // Toast Notification System
  showToast: (message, type = 'info') => {
    const toast = document.createElement('div');
    toast.className = 'scale-in';
    toast.style.cssText = `
position: fixed;
bottom: 24px;
right: 24px;
background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--accent-primary)'};
color: white;
padding: 16px 24px;
border - radius: 12px;
box - shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
z - index: 10000;
max - width: 400px;
font - weight: 500;
`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  updateMetrics: () => {
    document.getElementById('currentStreak').textContent = app.user.currentStreak || 0;
    document.getElementById('longestStreak').textContent = app.user.longestStreak || 0;
  },

  switchView: (viewName) => {
    document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
    event?.target.closest('.sidebar-item')?.classList.add('active');

    app.currentView = viewName;

    switch (viewName) {
      case 'boards': app.loadBoards(); break;
      case 'profile': app.loadProfile(); break;
      case 'leaderboard': app.loadLeaderboard(); break;
      case 'analytics': app.loadAnalytics(); break;
    }

    // Re-render icons after view change
    setTimeout(() => lucide.createIcons(), 100);
  },

  loadBoards: async () => {
    const container = document.getElementById('view-container');
    container.innerHTML = '<div style="color:var(--text-secondary);">Loading boards...</div>';

    const res = await fetch('/api/boards');
    const boards = await res.json();
    document.getElementById('totalBoards').textContent = boards.length;

    container.innerHTML = `
      <div class="flex-between" style="margin-bottom: 24px;">
        <h2>Your Growth Boards</h2>
        <button class="btn btn-primary" onclick="app.openCreateModal()">+ New Board</button>
      </div>
      <div id="boards-list" class="grid-cols"></div>
`;

    const list = document.getElementById('boards-list');
    if (boards.length === 0) {
      list.innerHTML = `
        <div class="card glass" style="grid-column: 1/-1; text-align: center; padding: 60px;">
          <div style="font-size: 3rem; margin-bottom: 20px;"><i data-lucide="sprout" style="width: 48px; height: 48px;"></i></div>
          <h3>No Boards Yet</h3>
          <p>Create your first growth board to start generating content.</p>
          <button class="btn btn-primary" onclick="app.openCreateModal()" style="margin-top: 16px;">Create First Board</button>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    boards.forEach(board => {
      const el = document.createElement('div');
      el.className = 'card glass';
      el.innerHTML = `
        <div class="flex-between" style="margin-bottom: 16px;">
          <div>
            <h3 style="margin-bottom: 4px;">${board.title}</h3>
            <span style="font-size:0.8rem; color: var(--accent-primary); background: rgba(29, 155, 240, 0.1); padding: 4px 8px; border-radius: 4px;">${board.strategy}</span>
          </div>
        </div>

  <p style="font-size: 0.9rem; margin-bottom: 12px;">${board.objective}</p>
        ${board.customPrompt ? `<p style="font-size: 0.8rem; color: var(--text-tertiary); margin-bottom: 16px;"><i data-lucide="sparkles" style="width: 12px; height: 12px; display: inline;"></i> ${board.customPrompt.substring(0, 60)}...</p>` : ''}
        
        <div style="margin-bottom: 12px; display: flex; gap: 12px; font-size: 0.8rem; color: var(--text-secondary);">
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input type="radio" name="length-${board.id}" value="short" checked> Short
            </label>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input type="radio" name="length-${board.id}" value="long"> Long
            </label>
        </div>

        <button class="btn btn-primary" style="width: 100%;" onclick="app.generateTweet('${board.id}', this)">
          Generate Tweet
        </button>
        
        <div id="tweet-area-${board.id}" style="margin-top: 16px;"></div>
`;
      list.appendChild(el);
    });
    lucide.createIcons();
  },

  loadProfile: () => {
    const container = document.getElementById('view-container');
    container.innerHTML = `
      <h2 style="margin-bottom: 24px;">Profile Settings</h2>
      
      <div class="card glass" style="max-width: 600px;">
        <h3 style="margin-bottom: 20px;">Preferences</h3>
        <form onsubmit="app.saveProfile(event)">
          <label>Niche / Industry</label>
          <input type="text" id="p_niche" value="${app.user.niche || ''}" placeholder="e.g. Backend Engineering, SaaS" />
          
          <label>Growth Goal</label>
          <input type="text" id="p_goal" value="${app.user.goal || ''}" placeholder="e.g. Reach 10k followers" />
          
          <label>Region / Timezone</label>
          <input type="text" id="p_region" value="${app.user.region || ''}" placeholder="e.g. EST, PST" />
          
          <label>Custom Tone Instructions</label>
          <textarea id="p_customTone" placeholder="e.g. Always use lowercase, be edgy, avoid corporate speak..." style="min-height: 100px;">${app.user.customTone || ''}</textarea>
          
          <button type="submit" class="btn btn-primary" style="margin-top: 16px;">Save Changes</button>
        </form>
      </div>

      <div class="card glass" style="max-width: 600px; margin-top: 24px; padding: 0; overflow: hidden;">
        <!-- Banner -->
        <div style="height: 150px; background: linear-gradient(135deg, rgba(29, 155, 240, 0.3), rgba(0, 186, 124, 0.2)); position: relative;"></div>
        
        <!-- Profile Info -->
        <div style="padding: 0 24px 24px; margin-top: -50px; position: relative;">
          <!-- Avatar -->
          <div style="width: 100px; height: 100px; border-radius: 50%; background: var(--bg-card); border: 4px solid var(--bg-card); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; margin-bottom: 16px;">
            ${app.user.username.charAt(0).toUpperCase()}
          </div>
          
          <!-- Plan Badge -->
          <div style="position: absolute; top: 70px; right: 24px;">
            ${app.user.isPro
        ? '<span style="background: linear-gradient(135deg, #FFD700, #FFA500); color: #000; padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="crown" style="width: 12px; height: 12px;"></i> PRO</span>'
        : '<span style="background: rgba(255,255,255,0.1); padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; color: var(--text-secondary);">Free Plan</span>'
      }
          </div>
          
          <!-- Name & Username -->
          <div style="margin-bottom: 12px;">
            <h3 style="font-size: 1.25rem; margin: 0 0 4px 0;">${app.user.username}</h3>
            <div style="color: var(--text-tertiary); font-size: 0.9rem;">@${app.user.username}</div>
          </div>
          
          <!-- Bio / Goal -->
          ${app.user.goal ? `<p style="margin: 12px 0; color: var(--text-secondary);">${app.user.goal}</p>` : ''}
          ${app.user.niche ? `<p style="margin: 8px 0; font-size: 0.9rem;"><i data-lucide="briefcase" style="width: 14px; height: 14px; display: inline; vertical-align: middle;"></i> ${app.user.niche}</p>` : ''}
          
          <!-- Stats Row -->
          <div style="display: flex; gap: 24px; margin: 16px 0; padding: 16px 0; border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div>
              <div style="font-size: 1.25rem; font-weight: 700; color: white;">${app.user.followerCount?.toLocaleString() || 0}</div>
              <div style="font-size: 0.8rem; color: var(--text-tertiary);">Followers</div>
            </div>
            <div>
              <div style="font-size: 1.25rem; font-weight: 700; color: white;">${app.user.currentStreak || 0}</div>
              <div style="font-size: 0.8rem; color: var(--text-tertiary);">Day Streak</div>
            </div>
            <div>
              <div style="font-size: 1.25rem; font-weight: 700; color: white;">${app.user.longestStreak || 0}</div>
              <div style="font-size: 0.8rem; color: var(--text-tertiary);">Best Streak</div>
            </div>
          </div>
          
          <!-- Meta Info -->
          <div style="display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.85rem; color: var(--text-tertiary);">
            <div style="display: flex; align-items: center; gap: 4px;">
              <i data-lucide="mail" style="width: 14px; height: 14px;"></i>
              ${app.user.email}
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <i data-lucide="calendar" style="width: 14px; height: 14px;"></i>
              Joined ${new Date(app.user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      <!-- Profile Analysis Section -->
      <div class="card glass" style="max-width: 600px; margin-top: 24px;">
    <div class="flex-between" style="margin-bottom: 20px;">
      <h3><i data-lucide="bar-chart-2" style="width: 18px; height: 18px; display: inline; vertical-align: middle;"></i> Profile Analysis</h3>
      ${app.user.isPro
        ? '<button class="btn btn-primary" onclick="app.runAnalysis()" style="font-size: 0.85rem; padding: 8px 16px;">Analyze My Profile</button>'
        : '<span style="font-size: 0.8rem; color: var(--text-tertiary);">Pro Feature</span>'
      }
    </div>

    <div id="audit-results">
      ${app.user.auditData ? app.renderAuditResults(JSON.parse(app.user.auditData)) :
        (app.user.isPro
          ? '<p style="color: var(--text-tertiary); font-size: 0.9rem;">Click "Analyze My Profile" to get insights about your Twitter content and engagement patterns.</p>'
          : '<div style="padding: 20px; text-align: center; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.1);"><p style="margin-bottom: 12px; font-weight: 600;">🔒 Unlock Profile Analysis with Pro</p><ul style="text-align: left; display: inline-block; margin: 12px 0; padding-left: 20px; color: var(--text-secondary); font-size: 0.9rem;"><li>Content tone analysis</li><li>Top-performing topics</li><li>Best posting times</li><li>Personalized recommendations</li></ul><button class="btn btn-primary" onclick="app.openUpgradeModal()" style="margin-top: 12px;">Upgrade to Pro</button></div>'
        )
      }
    </div>
  </div>
`;
    lucide.createIcons();
  },

  saveProfile: async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: document.getElementById('p_niche').value,
          goal: document.getElementById('p_goal').value,
          region: document.getElementById('p_region').value,
          customTone: document.getElementById('p_customTone').value
        })
      });

      if (!res.ok) throw new Error('Failed to save');
      app.user = await res.json();
      app.showToast('✅ Profile updated successfully!', 'success');
    } catch (err) {
      app.showToast('❌ ' + err.message, 'error');
    } finally {
      btn.textContent = 'Save Changes';
      btn.disabled = false;
    }
  },

  loadLeaderboard: async () => {
    const container = document.getElementById('view-container');
    container.innerHTML = '<div style="color:var(--text-secondary);">Loading leaderboard...</div>';

    const res = await fetch('/api/profile/leaderboard');
    const leaders = await res.json();

    container.innerHTML = `
  < h2 style = "margin-bottom: 24px;" > <i data-lucide="trophy" style="width: 24px; height: 24px; display: inline; vertical-align: middle;"></i> Growth Leaderboard</h2 >
    <div class="card glass" style="max-width: 700px;">
      ${leaders.length === 0 ? '<p>No streaks yet. Be the first!</p>' : ''}
      ${leaders.map((u, i) => {
      const growthColor = u.growthPercentage > 0 ? 'var(--success)' : u.growthPercentage < 0 ? 'var(--error)' : 'var(--text-tertiary)';
      const trendIcon = u.growthPercentage > 0 ? 'trending-up' : u.growthPercentage < 0 ? 'trending-down' : 'minus';
      return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; align-items: center; gap: 16px; flex: 1;">
              <div style="font-size: 1.5rem; font-weight: 800; color: ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? '#cd7f32' : 'var(--text-tertiary)'}; min-width: 40px;">#${i + 1}</div>
              <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 4px;">${u.username}</div>
                <div style="font-size: 0.8rem; color: var(--text-tertiary);">Longest: ${u.longestStreak} days • Followers: ${u.followerCount.toLocaleString()}</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="text-align: right;">
                <div style="font-size: 0.9rem; font-weight: 600; color: ${growthColor}; display: flex; align-items: center; gap: 4px; justify-content: flex-end;">
                  <i data-lucide="${trendIcon}" style="width: 14px; height: 14px;"></i>
                  ${u.growthPercentage > 0 ? '+' : ''}${u.growthPercentage}%
                </div>
                <div style="font-size: 0.7rem; color: var(--text-tertiary);">growth</div>
              </div>
              <div style="font-size: 1.2rem; font-weight: 700; color: var(--accent-primary); display: flex; align-items: center; gap: 4px;">
                ${u.currentStreak} <i data-lucide="flame" style="width: 16px; height: 16px;"></i>
              </div>
            </div>
          </div>
        `;
    }).join('')}
    </div>
`;
    lucide.createIcons();
  },

  loadAnalytics: () => {
    const container = document.getElementById('view-container');

    // Mock data for demonstration (would come from backend in production)
    const followerData = app.user.followerCount || 0;
    const streakData = app.user.currentStreak || 0;

    container.innerHTML = `
      <h2 style="margin-bottom: 24px;"><i data-lucide="bar-chart-3" style="width: 24px; height: 24px; display: inline; vertical-align: middle;"></i> Growth Analytics</h2>
      
      <!-- Overview Cards -->
      <div class="grid-cols" style="margin-bottom: 32px;">
        <div class="card glass">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
            <div>
              <div style="font-size: 0.85rem; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 8px;">Total Followers</div>
              <div style="font-size: 2rem; font-weight: 700;">${followerData.toLocaleString()}</div>
            </div>
            <i data-lucide="users" style="width: 32px; height: 32px; color: var(--accent-primary); opacity: 0.3;"></i>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">
            <i data-lucide="trending-up" style="width: 12px; height: 12px; display: inline; vertical-align: middle;"></i>
            Track follower growth over time
          </div>
        </div>

        <div class="card glass">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
            <div>
              <div style="font-size: 0.85rem; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 8px;">Posting Streak</div>
              <div style="font-size: 2rem; font-weight: 700;">${streakData} days</div>
            </div>
            <i data-lucide="flame" style="width: 32px; height: 32px; color: var(--success); opacity: 0.3;"></i>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">
            Keep the momentum going!
          </div>
        </div>

        <div class="card glass">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
            <div>
              <div style="font-size: 0.85rem; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 8px;">Boards Active</div>
              <div style="font-size: 2rem; font-weight: 700;">${document.getElementById('totalBoards')?.textContent || 0}</div>
            </div>
            <i data-lucide="target" style="width: 32px; height: 32px; color: var(--accent-primary); opacity: 0.3;"></i>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">
            Growth objectives tracked
          </div>
        </div>
      </div>

      <!-- Follower Growth Chart -->
      <div class="card glass" style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 20px;"><i data-lucide="trending-up" style="width: 18px; height: 18px; display: inline; vertical-align: middle;"></i> Follower Growth (Last 30 Days)</h3>
        
        ${app.user.isPro ? `
          <div id="follower-chart-container">
            <div style="padding: 40px; text-align: center; color: var(--text-tertiary);">Loading chart...</div>
          </div>
        ` : `
          <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 40px; text-align: center; border: 1px dashed rgba(255,255,255,0.1);">
            <i data-lucide="lock" style="width: 48px; height: 48px; opacity: 0.3; margin-bottom: 12px;"></i>
            <p style="color: var(--text-secondary); margin-bottom: 8px; font-weight: 600;">🔒 Follower Growth Tracking is Pro Only</p>
            <p style="font-size: 0.8rem; color: var(--text-tertiary); margin-bottom: 12px;">Upgrade to track your follower growth with daily charts, trends, and insights</p>
            <button class="btn btn-primary" onclick="app.openUpgradeModal()" style="margin-top: 8px;">Upgrade to Pro</button>
          </div>
        `}
      </div>

      <!-- Engagement Insights -->
      <div class="card glass" style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 20px;"><i data-lucide="heart" style="width: 18px; height: 18px; display: inline; vertical-align: middle;"></i> Engagement Insights</h3>
        
        ${app.user.auditData ? (() => {
        const audit = JSON.parse(app.user.auditData);
        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
              <div style="padding: 16px; background: rgba(29, 155, 240, 0.1); border-radius: 8px; border-left: 3px solid var(--accent-primary);">
                <div style="font-size: 0.75rem; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 4px;">Avg Engagement</div>
                <div style="font-size: 1.5rem; font-weight: 700;">${audit.avgEngagement}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">likes + retweets + replies</div>
              </div>
              
              <div style="padding: 16px; background: rgba(0, 186, 124, 0.1); border-radius: 8px; border-left: 3px solid var(--success);">
                <div style="font-size: 0.75rem; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 4px;">Content Tone</div>
                <div style="font-size: 1.5rem; font-weight: 700; text-transform: capitalize;">${audit.tone}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">detected style</div>
              </div>
              
              <div style="padding: 16px; background: rgba(249, 24, 128, 0.1); border-radius: 8px; border-left: 3px solid var(--error);">
                <div style="font-size: 0.75rem; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 4px;">Best Time</div>
                <div style="font-size: 1.5rem; font-weight: 700;">${audit.bestPostingHour}:00</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">optimal posting hour</div>
              </div>
            </div>
            
            <div style="margin-top: 20px; padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px;">
              <div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 8px;">Top Performing Topics</div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                ${audit.topics.map((topic, i) => `
                  <div style="display: flex; align-items: center; gap: 6px; background: rgba(29, 155, 240, ${0.2 - i * 0.03}); padding: 6px 12px; border-radius: 16px;">
                    <span style="font-weight: 600; color: var(--accent-primary);">#${i + 1}</span>
                    <span style="font-size: 0.85rem;">${topic}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
      })() : `
          <div style="text-align: center; padding: 40px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.1);">
            <i data-lucide="activity" style="width: 48px; height: 48px; opacity: 0.3; margin-bottom: 12px;"></i>
            <p style="color: var(--text-secondary); margin-bottom: 12px;">Run a profile analysis to see engagement insights</p>
            <button class="btn btn-primary" onclick="app.switchView('profile')" style="font-size: 0.9rem; padding: 8px 16px;">Go to Profile</button>
          </div>
        `}
      </div>

      <!-- Posting Activity -->
      <div class="card glass">
        <h3 style="margin-bottom: 20px;"><i data-lucide="calendar" style="width: 18px; height: 18px; display: inline; vertical-align: middle;"></i> Posting Activity</h3>

        <div style="display: flex; align-items: center; gap: 24px; margin-bottom: 20px;">
          <div style="text-align: center;">
            <div style="font-size: 2.5rem; font-weight: 800; color: var(--success);">${app.user.currentStreak || 0}</div>
            <div style="font-size: 0.8rem; color: var(--text-tertiary);">Current Streak</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 2.5rem; font-weight: 800; color: var(--accent-primary);">${app.user.longestStreak || 0}</div>
            <div style="font-size: 0.8rem; color: var(--text-tertiary);">Best Streak</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 2.5rem; font-weight: 800; color: var(--text-primary);">${app.user.generationCount || 0}</div>
            <div style="font-size: 0.8rem; color: var(--text-tertiary);">Total Posts</div>
          </div>
        </div>

        <div style="padding: 16px; background: rgba(0, 186, 124, 0.1); border-radius: 8px; border-left: 3px solid var(--success);">
          <div style="font-size: 0.9rem; color: var(--text-secondary);">
            ${app.user.lastPostDate
        ? `Last posted: <strong>${new Date(app.user.lastPostDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</strong>`
        : 'You haven\'t confirmed any posts yet. Generate a tweet and click "I Posted" to start tracking!'}
          </div>
        </div>

    <p style="margin-top: 12px; font-size: 0.8rem; color: var(--text-secondary); text-align: center;">
      Posting streak: <strong style="color: var(--success);">${app.user.currentStreak} days</strong> •
      Best streak: <strong style="color: var(--accent-primary);">${app.user.longestStreak} days</strong>
    </p>
  </div>
`;
    lucide.createIcons();

    // Load follower chart if Pro user
    if (app.user.isPro) {
      app.loadFollowerChart();
    }
  },

  loadFollowerChart: async () => {
    const container = document.getElementById('follower-chart-container');
    if (!container) return;

    try {
      const res = await fetch('/api/profile/follower-history');
      const data = await res.json();

      console.log('Follower history response:', res.ok, data);

      if (!res.ok) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--error);">' + (data.error || 'Failed to load data') + '</div>';
        return;
      }

      if (data.length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-tertiary);">No follower data yet. Check back tomorrow!</div>';
        return;
      }

      // If only 1 data point, show current stat
      if (data.length === 1) {
        const count = data[0].count;
        container.innerHTML = '<div style="padding: 40px; text-align: center;"><div style="font-size: 3rem; font-weight: 800; color: var(--accent-primary); margin-bottom: 8px;">' + count.toLocaleString() + '</div><div style="color: var(--text-secondary); margin-bottom: 16px;">Current Followers</div><div style="font-size: 0.85rem; color: var(--text-tertiary);">📊 Growth chart appears after multiple days of data.</div></div>';
        return;
      }

      // Multiple data points - render chart
      container.innerHTML = '<canvas id="followerChart" style="max-height: 300px;"></canvas>';
      const ctx = document.getElementById('followerChart').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
          datasets: [{
            label: 'Followers',
            data: data.map(d => d.count),
            borderColor: 'rgba(29, 155, 240, 1)',
            backgroundColor: 'rgba(29, 155, 240, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: false, ticks: { color: '#8899a6' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            x: { ticks: { color: '#8899a6' }, grid: { display: false } }
          }
        }
      });
    } catch (err) {
      console.error('Follower chart error:', err);
      container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--error);">Failed to load chart</div>';
    }
  },

  openCreateModal: () => {
    document.getElementById('createModal').classList.add('active');
    document.getElementById('m_title').focus();
  },

  closeModal: (id) => {
    document.getElementById(id).classList.remove('active');
  },

  toggleMobileMenu: () => {
    const sidebar = document.querySelector('.sidebar');
    const menuBtn = document.getElementById('mobile-menu-btn');
    sidebar.classList.toggle('open');

    // Update icon
    const icon = menuBtn.querySelector('i');
    if (sidebar.classList.contains('open')) {
      icon.setAttribute('data-lucide', 'x');
    } else {
      icon.setAttribute('data-lucide', 'menu');
    }
    lucide.createIcons();
  },

  closeMobileMenu: () => {
    const sidebar = document.querySelector('.sidebar');
    const menuBtn = document.getElementById('mobile-menu-btn');
    sidebar.classList.remove('open');
    const icon = menuBtn?.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', 'menu');
      lucide.createIcons();
    }
  },

  handleCreateSubmit: async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Creating...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: document.getElementById('m_title').value,
          objective: document.getElementById('m_objective').value,
          strategy: document.getElementById('m_strategy').value,
          customPrompt: document.getElementById('m_customPrompt').value || null
        })
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed');
      }

      app.closeModal('createModal');
      e.target.reset();
      app.loadBoards();
      app.showToast('✅ Board created successfully!', 'success');

    } catch (err) {
      app.showToast('❌ ' + err.message, 'error');
    } finally {
      btn.textContent = 'Create Board';
      btn.disabled = false;
    }
  },

  generateTweet: async (boardId, btn) => {
    const area = document.getElementById(`tweet-area-${boardId}`);
    const length = document.querySelector(`input[name="length-${boardId}"]:checked`)?.value || 'short';

    // UI Loading State
    const originalText = btn ? btn.innerText : 'Generate Tweet';
    if (btn) {
      btn.textContent = 'Generating...';
      btn.disabled = true;
    }

    area.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">✨ Generating...</p>';

    try {
      const res = await fetch(`/api/boards/${boardId}/tweets/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ length })
      });
      const tweet = await res.json();

      if (tweet.error) throw new Error(tweet.error);

      area.innerHTML = `
        <div style="background: rgba(255,255,255,0.03); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); animation: scaleIn 0.3s ease;">
          <p style="font-size: 1.05rem; margin-bottom: 12px; white-space: pre-wrap; color: #fff;">${tweet.content}</p>
          
          <div class="flex-between" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); gap: 8px;">
             <span style="font-size: 0.75rem; color: var(--text-tertiary);">${tweet.rationale}</span>
             <div style="display: flex; gap: 8px;">
               <button class="btn btn-outline" onclick="navigator.clipboard.writeText(\`${tweet.content}\`); app.showToast('📋 Copied to clipboard!', 'success');" style="font-size:0.8rem; padding: 6px 16px;">📋 Copy</button>
               <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet.content)}" target="_blank" class="btn btn-primary" style="font-size:0.8rem; padding: 6px 16px;">Post to X</a>
               <button class="btn btn-outline" onclick="app.confirmPost()" style="font-size:0.8rem; padding: 6px 16px;">✓ I Posted</button>
             </div>
          </div>
        </div>
      `;
    } catch (err) {
      if (err.message === 'LIMIT_REACHED') {
        area.innerHTML = `
          <div style="background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.05)); padding: 20px; border-radius: 12px; border: 1px solid rgba(255, 215, 0, 0.3); text-align: center;">
            <div style="font-size: 2rem; margin-bottom: 12px;">🔒</div>
            <h3 style="margin-bottom: 8px; color: #FFD700;">Free Trial Exceeded</h3>
            <p style="color: var(--text-secondary); margin-bottom: 16px; font-size: 0.9rem;">
              You've used all 3 free generations. Upgrade to Pro for unlimited tweet generation!
            </p>
            <button class="btn btn-primary" onclick="app.openUpgradeModal()" style="background: linear-gradient(135deg, #FFD700, #FFA500); color: #000; font-weight: 700;">
              Upgrade to Pro
            </button>
          </div>
        `;
      } else {
        area.innerHTML = `<p style="color: var(--error);">Error: ${err.message}</p>`;
      }
    } finally {
      if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }
  },

  confirmPost: async () => {
    try {
      const res = await fetch('/api/streak/confirm-post', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to confirm');

      // Update metrics
      app.user.currentStreak = data.currentStreak;
      app.user.longestStreak = data.longestStreak;
      app.updateMetrics();

      // Show celebration toast
      if (data.isNewRecord) {
        app.showToast(`🎉 New record! ${data.currentStreak} day streak!`, 'success');
      } else {
        app.showToast(`${data.message} Current: ${data.currentStreak} days 🔥`, 'success');
      }

    } catch (err) {
      // If 401, redirect to login
      if (err.message && err.message.includes('expired')) {
        window.location.href = '/auth/twitter';
        return;
      }
      app.showToast('❌ ' + err.message, 'error');
    }
  },

  // --- PROMOTION SYSTEM ---

  renderPromotedCard: async () => {
    try {
      const res = await fetch('/api/promote');
      const data = await res.json();
      let users = data.promotions || [];

      const container = document.getElementById('promoted-section');
      if (!container) return;

      // Duplicate users if fewer than 10 to make the carousel feel full and loop smoothly
      if (users.length > 0) {
        while (users.length < 10) {
          users = [...users, ...users];
        }
      }
      // Create a double set for seamless infinite scroll
      const displayUsers = [...users, ...users];

      // Inject styles if not present
      if (!document.getElementById('carousel-styles')) {
        const style = document.createElement('style');
        style.id = 'carousel-styles';
        style.textContent = `
@keyframes scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.carousel-track {
  display: flex;
  gap: 16px;
  width: max-content;
  animation: scroll 40s linear infinite;
}
.carousel-track:hover {
  animation-play-state: paused;
}
.promo-card {
  width: 200px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: transform 0.2s, background 0.2s;
  text-decoration: none;
  color: inherit;
}
.promo-card:hover {
  transform: translateY(-4px);
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 215, 0, 0.3);
}
`;
        document.head.appendChild(style);
      }

      container.innerHTML = `
            <div style="margin-bottom: 24px; position: relative; padding: 12px 0; max-width: 100%; overflow: hidden;">
                <div class="flex-between" style="margin-bottom: 16px; padding: 0 4px;">
                    <h3 style="font-size: 1rem; color: #FFD700; display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="sparkles" style="width: 16px; height: 16px;"></i> 
                        Who to Follow
                    </h3>
                    <button class="btn btn-outline" onclick="app.openPromoteModal()" style="font-size: 0.75rem; padding: 4px 12px; border-color: rgba(255, 215, 0, 0.3); color: #FFD700;">
                        Promote Yourself
                    </button>
                </div>

                 <!-- Gradient Masks for Fade Effect -->
                <div style="position: absolute; left: 0; top: 40px; bottom: 0; width: 60px; background: linear-gradient(to right, var(--bg-body), transparent); z-index: 2; pointer-events: none;"></div>
                <div style="position: absolute; right: 0; top: 40px; bottom: 0; width: 60px; background: linear-gradient(to left, var(--bg-body), transparent); z-index: 2; pointer-events: none;"></div>
                
                <div style="width: 100%; overflow: hidden;">
                    <div class="carousel-track">
                        ${displayUsers.length === 0 ?
          '<div style="padding: 20px; color: var(--text-tertiary); width: 100%; text-align: center;">No promoted accounts yet. Be the first!</div>' :
          displayUsers.map(p => `
                            <a href="https://twitter.com/${p.user.username}" target="_blank" class="promo-card">
                                <div style="position: relative; margin-bottom: 12px;">
                                    <div style="width: 60px; height: 60px; border-radius: 50%; background: var(--bg-card); display: flex; align-items: center; justify-content: center; border: 2px solid rgba(255,255,255,0.1); overflow: hidden;">
                                        ${p.user.profileImageUrl ? `<img src="${p.user.profileImageUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : p.user.username[0].toUpperCase()}
                                    </div>
                                    ${p.user.isVerified ? '<div style="position: absolute; bottom: 0; right: 0; background: var(--bg-body); border-radius: 50%; padding: 2px;"><i data-lucide="badge-check" style="width: 16px; height: 16px; color: #1d9bf0; fill: #1d9bf0; stroke: #fff;"></i></div>' : ''}
                                </div>
                                
                                <div style="width: 100%;">
                                    <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.user.username}</div>
                                    ${p.user.niche ? `<div style="font-size: 0.7rem; color: var(--text-tertiary); margin-bottom: 8px;">${p.user.niche}</div>` : '<div style="height: 17px; margin-bottom: 8px;"></div>'}
                                    <div style="font-size: 0.8rem; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4; height: 2.8em;">
                                        "${p.tagline}"
                                    </div>
                                </div>
                            </a>
                        `).join('')}
                    </div>
                </div>
            </div>
  `;
      lucide.createIcons();
    } catch (e) {
      console.error("Failed to load promotions", e);
    }
  },

  openPromoteModal: () => {
    document.getElementById('promoteModal').classList.add('active');
  },

  openUpgradeModal: () => {
    document.getElementById('upgradeModal').classList.add('active');
  },

  initializePayment: async () => {
    try {
      app.showToast('Redirecting to payment...', 'info');
      const res = await fetch('/api/payment/initialize', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Payment initialization failed');

      // Redirect to Paystack checkout
      window.location.href = data.authorization_url;
    } catch (err) {
      app.showToast('❌ ' + err.message, 'error');
    }
  },

  handlePromoteSubmit: async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Processing Payment...';
    btn.disabled = true;

    try {
      const tagline = document.getElementById('promo_tagline').value;
      const res = await fetch('/api/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagline })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      app.showToast('🚀 Promoted successfully! You are live.', 'success');
      app.closeModal('promoteModal');
      app.renderPromotedCard();
    } catch (err) {
      app.showToast('❌ ' + err.message, 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  },

  runAnalysis: async () => {
    const resultsDiv = document.getElementById('audit-results');
    resultsDiv.innerHTML = '<p style="color: var(--text-secondary);">Analyzing your profile... This may take a moment.</p>';

    try {
      const res = await fetch('/api/profile/analyze', { method: 'POST' });
      const audit = await res.json();

      if (!res.ok) throw new Error(audit.error || 'Analysis failed');

      app.user.auditData = JSON.stringify(audit);
      resultsDiv.innerHTML = app.renderAuditResults(audit);
      lucide.createIcons();
      app.showToast('✅ Profile analyzed successfully!', 'success');
    } catch (err) {
      // Check if it's a session expired error
      if (err.message.includes('session') || err.message.includes('expired') || err.message.includes('401')) {
        resultsDiv.innerHTML = `
          <div style="background: linear-gradient(135deg, rgba(249, 24, 128, 0.1), rgba(249, 24, 128, 0.02)); padding: 24px; border-radius: 12px; border: 1px solid rgba(249, 24, 128, 0.3); text-align: center;">
            <div style="font-size: 2.5rem; margin-bottom: 12px;">🔐</div>
            <h3 style="margin-bottom: 8px; color: #f91880;">Session Expired</h3>
            <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 0.9rem;">
              Your Twitter authentication has expired. Please re-connect your account to continue.
            </p>
            <a href="/auth/twitter" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 8px;">
              <svg fill="currentColor" viewBox="0 0 24 24" style="width: 18px; height: 18px;">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
              </svg>
              Re-connect X Account
            </a>
          </div>
        `;
      } else {
        resultsDiv.innerHTML = `<p style="color: var(--error);">${err.message}</p>`;
      }
      app.showToast('❌ ' + err.message, 'error');
    }
  },

  renderAuditResults: (audit) => {
    return `
      <div style="display: grid; gap: 16px;">
        <!-- Summary Stats -->
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <div style="padding: 12px; background: rgba(29, 155, 240, 0.1); border-radius: 8px;">
            <div style="font-size: 0.75rem; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 4px;">Tone</div>
            <div style="font-size: 1.1rem; font-weight: 600; color: var(--accent-primary);">${audit.tone}</div>
          </div>
          <div style="padding: 12px; background: rgba(0, 186, 124, 0.1); border-radius: 8px;">
            <div style="font-size: 0.75rem; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 4px;">Avg Engagement</div>
            <div style="font-size: 1.1rem; font-weight: 600; color: var(--success);">${audit.avgEngagement}</div>
          </div>
        </div>

        <!-- Top Topics -->
        <div>
          <div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 8px;">Top Topics</div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${audit.topics.map(topic => `<span style="background: rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 12px; font-size: 0.8rem;">${topic}</span>`).join('')}
          </div>
        </div>

        <!--Recommendations -->
        <div>
          <div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 8px;"><i data-lucide="lightbulb" style="width: 14px; height: 14px; display: inline; vertical-align: middle;"></i> Recommendations</div>
          <ul style="margin: 0; padding-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.6;">
            ${audit.recommendations.map(rec => `<li>${rec}</li>`).join('')}
          </ul>
        </div>

        <!-- Last Analyzed -->
        <div style="font-size: 0.75rem; color: var(--text-tertiary); text-align: right;">
          Last analyzed: ${new Date(audit.analyzedAt).toLocaleString()}
        </div>
      </div>
    `;
  }
};

document.addEventListener('DOMContentLoaded', app.init);
