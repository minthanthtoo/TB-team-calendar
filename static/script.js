document.addEventListener('DOMContentLoaded', function() {
  if(window.hydrateLocalData) window.hydrateLocalData();

  
  // -- Toast Notification System --
  // -- Toast Notification System --
  window.showToast = showToast;
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '✓';
    if(type === 'error') icon = '⚠️';
    if(type === 'info') icon = 'ℹ️';

    toast.innerHTML = `
      <span>${icon}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    // Remove after 4 seconds for better readability
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // -- Network Status --
  function updateNetworkStatus() {
    const statusEl = document.getElementById('networkStatus');
    if (!statusEl) return;
    
    if (navigator.onLine) {
        statusEl.innerHTML = '<span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span> Online';
        statusEl.style.background = '#d1fae5';
        statusEl.style.color = '#059669';
        window._offlineToastShown = false; // Reset flag when back online
    } else {
        const hasCachedData = window.allPatientData && window.allPatientData.length > 0;
        statusEl.innerHTML = `<span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></span> Offline ${hasCachedData ? '(Viewing Cached Data)' : ''}`;
        statusEl.style.background = '#fee2e2';
        statusEl.style.color = '#b91c1c';
        
        if (!window._offlineToastShown) {
          showToast("You are offline. Changes may not save.", "error");
          window._offlineToastShown = true;
        }
    }
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus(); // Initial check

  // Initialize Notification State
  window.lastPendingCount = 0;
  if (Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
  }

  // Team Pagination State
  window.currentPublicPage = 1;
  window.changePublicPage = function(delta) {
      window.currentPublicPage += delta;
      if(window.currentPublicPage < 1) window.currentPublicPage = 1;
      window.loadTeams();
  };

  // -- Mobile Responsive View --
  const isMobile = window.innerWidth < 768;
  const initialViewType = isMobile ? 'listMonth' : 'dayGridMonth';

  // -- Configuration --
  // Adjust Myanmar Calendar Calculation. 
  // -1 aligns JDN to match user expectation (likely due to Noon vs Midnight JDN definition)
  const MM_CAL_OFFSET = -1; 

  window.currentCalendarDuration = 'month'; // 'week', 'month', 'year'
  window.currentCalendarType = 'grid'; // 'grid', 'list'

  function applyCalendarView() {
    if(!window.calendar) return;
    
    const calEl = document.getElementById('calendar');
    const yearGridEl = document.getElementById('year-summary-grid');
    
    // Default visibility: show harness, hide custom grid
    calEl.classList.remove('yearly-grid-active');
    yearGridEl.style.display = 'none';

    let viewName = 'dayGridMonth'; // fallback
    
    if(window.currentCalendarDuration === 'week') {
        viewName = window.currentCalendarType === 'grid' ? 'dayGridWeek' : 'listWeek';
    } else if(window.currentCalendarDuration === 'month') {
        viewName = window.currentCalendarType === 'grid' ? 'dayGridMonth' : 'listMonth';
    } else if(window.currentCalendarDuration === 'year') {
        if(window.currentCalendarType === 'grid') {
            // SPECIAL CASE: Yearly Chart (12 Cells Summary)
            calEl.classList.add('yearly-grid-active');
            yearGridEl.style.display = 'grid'; // Harness hiding handled by CSS
            viewName = 'multiMonthYear'; // Set underlying view so navigation moves by year
        } else {
            viewName = 'listYear';
        }
    }
    
    window.calendar.changeView(viewName);
    
    // If we just enabled yearly grid, render it for the current year
    if (calEl.classList.contains('yearly-grid-active')) {
      renderYearSummaryGrid(window.calendar.view.currentStart.getFullYear());
    }

    updateButtonActiveStates();
  }

  function renderYearSummaryGrid(targetYear) {
    const grid = document.getElementById('year-summary-grid');
    if(!grid) return;
    
    // Ensure grid is inside #calendar to keep header on top
    const calEl = document.getElementById('calendar');
    if(grid.parentNode !== calEl) {
        calEl.appendChild(grid);
    }

    const year = targetYear || new Date().getFullYear();
    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    
    let html = '';
    
    // Use global patient data for accurate dots
    const allPatients = window.allPatientData || [];
    const allYearEvents = [];
    allPatients.forEach(p => {
        (p.events || []).forEach(e => {
            const d = new Date(e.start);
            if(d.getFullYear() === year) {
                allYearEvents.push({
                    month: d.getMonth(),
                    color: e.color || '#0ea5e9',
                    uid: p.uid,
                    title: e.title,
                    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                    regime: p.regime || 'IR'
                });
            }
        });
    });
    
    months.forEach((m, idx) => {
        const monthEvents = allYearEvents.filter(e => e.month === idx);
        
        // Render dots for events with patient-specific colors and highlighting support
        // We limit dots to a reasonable number to avoid crowded UI but show range
        let dotsHtml = '';
        monthEvents.slice(0, 30).forEach(e => {
            dotsHtml += `<span class="month-event-dot" 
                data-patient-uid="${e.uid}" 
                data-label="${e.date} (${e.regime})"
                style="background-color: ${e.color};" 
                title="${e.title}: ${e.date}"></span>`;
        });
        if(monthEvents.length > 30) dotsHtml += `<span style="font-size:0.6rem; color:#94a3b8; margin-left:2px;">+</span>`;

        // Drill-down logic with explicit month boundaries
        const startOfMonth = new Date(year, idx, 1);
        const endOfMonth = new Date(year, idx + 1, 0, 23, 59, 59);

        html += `
            <div class="year-month-card" onclick="
                window.currentCalendarDuration='month'; 
                
                // LOCK: Prevent datesSet from overriding our precise filter for 600ms
                window._ignoreNextDatesSet = true;
                setTimeout(() => { window._ignoreNextDatesSet = false; }, 600);
                
                // Navigate to the 1st of the month
                window.calendar.gotoDate('${year}-${String(idx+1).padStart(2,'0')}-01'); 
                // Apply view, which shifts to dayGridMonth/listMonth
                applyCalendarView();
                
                // FORCE Update: Use explicit month boundaries calculated above
                // This ensures we show STRICTLY this month's data, not FC's padded view
                setTimeout(() => {
                    if(window.updateRegistryStatus) {
                        console.log('[YearMonth] Enforcing precise filter for:', '${m}', '${year}');
                        window.updateRegistryStatus(new Date(${startOfMonth.getTime()}), new Date(${endOfMonth.getTime()}));
                    }
                }, 50); // Faster trigger to ensure it sets state quickly
            ">
                <div class="year-month-name">
                    <span>${m}</span>
                    <span style="font-size:0.6rem; font-weight: normal; opacity:0.6;">${year}</span>
                </div>
                <div class="month-event-summary">
                    ${dotsHtml}
                </div>
            </div>
        `;
    });
    
    grid.innerHTML = html;
  }

  function updateButtonActiveStates() {
    // Update Active States for Custom Buttons
    document.querySelectorAll('.fc-btnWeek-button, .fc-btnMonth-button, .fc-btnYear-button').forEach(btn => btn.classList.remove('fc-button-active'));
    document.querySelectorAll('.fc-btnGrid-button, .fc-btnList-button').forEach(btn => btn.classList.remove('fc-button-active'));
    
    const durClass = `.fc-btn${window.currentCalendarDuration.charAt(0).toUpperCase() + window.currentCalendarDuration.slice(1)}-button`;
    const typeClass = `.fc-btn${window.currentCalendarType.charAt(0).toUpperCase() + window.currentCalendarType.slice(1)}-button`;
    
    const activeDur = document.querySelector(durClass);
    const activeType = document.querySelector(typeClass);
    if(activeDur) activeDur.classList.add('fc-button-active');
    if(activeType) activeType.classList.add('fc-button-active');
  }

  window.scrollToTop = function(elementId) {
    const el = document.getElementById(elementId);
    if(el) el.scrollTop = 0;
  }

  window.scrollToBottom = function(elementId) {
    const el = document.getElementById(elementId);
    if(el) el.scrollTop = el.scrollHeight;
  }

  // Initialize Calendar
  window.calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: initialViewType,
    headerToolbar: {
      left: isMobile ? 'prev,next' : 'prev,next today',
      center: 'title',
      right: 'btnWeek,btnMonth,btnYear btnGrid,btnList' // Always show full controls
    },
    customButtons: {
        btnWeek: { text: 'Week', click: function() { window.currentCalendarDuration = 'week'; applyCalendarView(); } },
        btnMonth: { text: 'Month', click: function() { window.currentCalendarDuration = 'month'; applyCalendarView(); } },
        btnYear: { text: 'Year', click: function() { window.currentCalendarDuration = 'year'; applyCalendarView(); } },
        btnGrid: { text: 'Grid', click: function() { window.currentCalendarType = 'grid'; applyCalendarView(); } },
        btnList: { text: 'List', click: function() { window.currentCalendarType = 'list'; applyCalendarView(); } }
    },
    datesSet: function(info) {
        console.log('[datesSet] Fired. View:', info.view.type);
        
        // Filter sidebar to only show patients with events in this view
        // SKIP if we are locked (during drill-down transition)
        if(window.updateRegistryStatus && !window._ignoreNextDatesSet) {
            window.updateRegistryStatus(info.start, info.end);
        } else {
             console.log('[datesSet] Skipped sidebar update due to lock.');
        }

        // If Yearly Grid is active, refresh it based on the current navigated year
        const calEl = document.getElementById('calendar');
        if(calEl && calEl.classList.contains('yearly-grid-active')) {
           renderYearSummaryGrid(info.view.currentStart.getFullYear());
        }
    },
    titleFormat: { year: 'numeric', month: isMobile ? 'short' : 'long' },
    height: 'auto', // Adjust height automatically
    themeSystem: 'standard', // we use our own CSS overrides
    events: function(fetchInfo, successCallback, failureCallback) {
        const team = localStorage.getItem('tb_team_slug') || '';
        const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
        let url = `/events?team=${team}&start=${fetchInfo.startStr}&end=${fetchInfo.endStr}`;
        
        fetch(url, {
            headers: { 'X-Device-ID': deviceId }
        })
        .then(res => {
            if(res.status === 403) {
                showToast("Calendar access denied.", "error");
                return [];
            }
            return res.json();
        })
        .then(data => successCallback(data))
        .catch(err => {
            console.error("Calendar fetch error, falling back to local data:", err);
            // Fallback to local data
            if(window.allPatientData && window.allPatientData.length > 0) {
                const events = [];
                window.allPatientData.forEach(p => {
                    if(p.events) {
                        p.events.forEach(e => {
                            // FullCalendar handles start/end filtering if we provide the whole list, 
                            // but we can be efficient if we want. For now, just return all for this view.
                            events.push(e);
                        });
                    }
                });
                successCallback(events);
                if (!window._offlineToastShown) {
                    showToast("Viewing Offline Calendar", "info");
                    window._offlineToastShown = true;
                }
            } else {
                failureCallback(err);
            }
        });
    },
    dayCellDidMount: function(info) {
        // Highlight Sabbath Days
        const d = info.date;
        const jdn = ceDateTime.w2j(d.getFullYear(), d.getMonth() + 1, d.getDate()) + MM_CAL_OFFSET;
        const isSabbath = ceMmDateTime.cal_sabbath(ceMmDateTime.j2m(jdn).md, ceMmDateTime.j2m(jdn).mm, ceMmDateTime.j2m(jdn).myt);
        if(isSabbath === 1) {
            info.el.classList.add('fc-day-sabbath');
        }
    },
    eventSources: [
      {
        id: 'myanmarHolidaySource',
        events: function(fetchInfo, successCallback, failureCallback) {
          try {
            const holidays = [];
            const showDetails = document.getElementById('toggleMyanmarDetails')?.checked;
            let start = new Date(fetchInfo.start);
            let end = new Date(fetchInfo.end);
            let curr = new Date(start);
            
            while (curr < end) {
              const y = curr.getFullYear(), m = curr.getMonth() + 1, d = curr.getDate();
              const jdn = ceDateTime.w2j(y, m, d) + MM_CAL_OFFSET;
              const mDate = ceMmDateTime.j2m(jdn); // {myt, my, mm, md}
              
              // 1. Public Holidays (Always show if possible, or bundle with toggle)
              const hList = ceMmDateTime.cal_holiday(jdn);
              if (hList && hList.length > 0) {
                hList.forEach(hName => {
                  holidays.push({
                    title: `🇲🇲 ${hName}`,
                    start: curr.toISOString().split('T')[0],
                    allDay: true,
                    className: 'holiday-event',
                    color: '#fef9c3',
                    textColor: '#854d0e'
                  });
                });
              }

              // 2. Myanmar Lunar Details (If Toggled)
              if (showDetails) {
                const mp = ceMmDateTime.cal_mp(mDate.md, mDate.mm, mDate.myt); // 0=wax, 1=full, 2=wan, 3=new
                const mf = ceMmDateTime.cal_mf(mDate.md);
                const isSabbath = ceMmDateTime.cal_sabbath(mDate.md, mDate.mm, mDate.myt); // 1=sab, 2=eve

                let lunarTitle = "";
                let lunarClass = "lunar-detail";
                let lunarColor = "transparent";

                if (mp === 1) lunarTitle = "🌕 Full Moon";
                else if (mp === 3) lunarTitle = "🌑 New Moon";
                else {
                    const phase = (mp === 0) ? "လဆန်း" : "လဆုတ်";
                    // Add newline between phase and day number
                    lunarTitle = `${phase}\n${mf} ရက်`;
                }

                if (isSabbath === 1) lunarTitle += " (ဥပုသ်နေ့)";
                
                holidays.push({
                  title: lunarTitle,
                  start: curr.toISOString().split('T')[0],
                  allDay: true,
                  className: lunarClass,
                  display: 'list-item',
                  textColor: '#64748b',
                  backgroundColor: 'transparent',
                  borderColor: 'transparent'
                });
              }

              curr.setDate(curr.getDate() + 1);
            }
            successCallback(holidays);
          } catch (e) {
            console.error("Holiday calculation error:", e);
            successCallback([]);
          }
        }
      }
    ],
    windowResize: function(view) {
      if (window.innerWidth < 768) {
        calendar.changeView('listMonth');
      } else {
        calendar.changeView('dayGridMonth');
      }
    },
    eventClick: function(info) {
      const p = info.event.extendedProps.patient;
      // Map FullCalendar event to our internal structure
      const eventData = {
          id: info.event.id,
          title: info.event.title,
          startStr: info.event.startStr,
          backgroundColor: info.event.backgroundColor || 'var(--primary)',
          extendedProps: info.event.extendedProps
      };
      
      window.openEventEditor(eventData, p);
    }
  });

  calendar.render();
  applyCalendarView(); // Set initial button states
  window.calendar = calendar;

  // -- Event Editor Modal Logic --
  window.openEventEditor = function(eventData, patient) {
      const modal = document.getElementById('eventModal');
      const modalTitle = document.getElementById('modalTitle');
      const modalDetails = document.getElementById('modalDetails');
      const modalHeader = modal.querySelector('.modal-header');

      modalTitle.innerText = `${patient.name} - ${eventData.title}`;
      modalHeader.style.backgroundColor = eventData.backgroundColor;

      const isMEnd = eventData.title.includes("M-end");
      
      // Outcome Options
      const outcomes = isMEnd 
        ? ["", "Cured", "Completed", "Failed", "LTFU", "Died"] 
        : ["", "Failed", "LTFU", "Died"];
      
      const outcomeLabels = {
          "": "Ongoing / Pending",
          "Cured": "✅ Cured",
          "Completed": "🏁 Completed",
          "Failed": "❌ Failed",
          "LTFU": "⚠️ LTFU",
          "Died": "💀 Died"
      };

      let outcomeGridHtml = '<div class="outcome-grid">';
      outcomes.forEach(opt => {
          const selected = eventData.extendedProps.outcome === opt ? 'selected' : '';
          const label = outcomeLabels[opt] || opt;
          outcomeGridHtml += `<div class="outcome-option ${selected}" data-value="${opt}" onclick="selectOutcome(this)">${label}</div>`;
      });
      outcomeGridHtml += '</div><input type="hidden" id="modalOutcome" value="' + (eventData.extendedProps.outcome || "") + '">';

      const originalDate = new Date(eventData.startStr);

      modalDetails.innerHTML = `
        <div style="background: linear-gradient(to right, #f8fafc, #fff); padding: 1rem; border-left: 4px solid ${eventData.backgroundColor}; border-radius: 8px; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
           <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
               <div style="font-size:1.1rem; font-weight:700; color:#334155;">${patient.name}</div>
               <div style="font-size:0.8rem; background:#f1f5f9; padding:2px 8px; border-radius:12px; color:#64748b;">${patient.regime}</div>
           </div>
           <div style="font-size:0.85rem; color:#64748b;">
             ID: <span style="font-family:monospace;">${patient.uid ? patient.uid.slice(0,4) : 'N/A'}</span> • ${patient.age}y/${patient.sex}
           </div>
        </div>

        <div class="form-section-title">📅 Schedule Management</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
             <div>
                <label>Planned Date</label>
                <div style="padding:0.75rem; background:#f8fafc; border-radius:8px; color:#64748b; font-weight:500;">${eventData.startStr}</div>
             </div>
             <div>
                <label>Adjusted Date</label>
                <div id="modalDate" style="padding:0.75rem; background:#fff; border:2px solid ${eventData.backgroundColor}; border-radius:8px; color:${eventData.backgroundColor}; font-weight:700;">${eventData.startStr}</div>
             </div>
        </div>

        <div class="form-group" style="margin-bottom: 1.5rem;">
           <label>Treatment Delay (Days)</label>
           <div style="display:flex; align-items:center; gap:10px;">
             <button class="btn btn-secondary" onclick="adjustMissed(-1)" style="width:40px; height:40px; font-weight:bold;">-</button>
             <input type="number" id="modalMissedDays" value="${eventData.extendedProps.missed_days || 0}" style="text-align:center; font-size:1.1rem; font-weight:bold; width:80px; height:40px;" readonly>
             <button class="btn btn-secondary" onclick="adjustMissed(1)" style="width:40px; height:40px; font-weight:bold;">+</button>
             <span style="font-size:0.8rem; color:#64748b; margin-left:5px;">days spilled over</span>
           </div>
           <p style="font-size:0.75rem; color:#ef4444; margin-top:5px;">⚠ Affects all future dates.</p>
        </div>

        <div class="form-section-title">🩺 Clinical Outcome</div>
        ${outcomeGridHtml}
        
        <div class="form-section-title" style="margin-top:1.5rem;">📝 Notes</div>
        <textarea id="modalRemark" rows="3" class="input-highlight" placeholder="Record clinical observations, complications, or patient feedback...">${eventData.extendedProps.remark || ''}</textarea>

        <div style="margin-top: 2rem; display: flex; justify-content: flex-end; gap: 1rem;">
           <button id="closeModalBtnSecondary" class="btn btn-secondary" style="border:none;">Cancel</button>
           <button id="saveEventBtn" class="btn" style="min-width: 140px; background-color: ${eventData.backgroundColor}; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">💾 Save Record</button>
        </div>
      `;

      // Show Modal
      modal.style.display = 'flex';

      // Wiring
      const missedInput = document.getElementById('modalMissedDays');
      const dateSpan = document.getElementById('modalDate');
      const closeSecBtn = document.getElementById('closeModalBtnSecondary');
      
      if(closeSecBtn) closeSecBtn.onclick = () => { modal.style.display = 'none'; };

      missedInput.addEventListener('input', function() {
        const newMissed = parseInt(this.value || 0);
        const shiftedDate = new Date(originalDate);
        shiftedDate.setDate(shiftedDate.getDate() + newMissed);
        dateSpan.innerText = shiftedDate.toISOString().slice(0,10);
      });

      // Save Action
      document.getElementById('saveEventBtn').onclick = function() {
        const btn = this;
        btn.disabled = true;
        btn.innerText = "Saving...";

        const missedDays = parseInt(missedInput.value || 0);
        const remark = document.getElementById('modalRemark').value;
        const outcome = document.getElementById('modalOutcome').value;

        fetch('/update_event', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            id: eventData.id,
            missed_days: missedDays,
            remark: remark,
            outcome: outcome
          })
        })
        .then(res => {
          if(!res.ok) throw new Error("Server error updating event");
          return res.json();
        })
        .then(data => {
          if (data.success) {
            showToast('Event updated successfully!', 'success');
            modal.style.display = 'none';
            calendar.refetchEvents(); 
            
            // Checks if Patient Detail Modal is open, if so, refresh it
            const detailModal = document.getElementById('patientDetailModal');
            if(detailModal && detailModal.style.display !== 'none' && patient.uid) {
                  refreshPatientDataAndUI(patient.uid);
            }
            if(window.updateRegistryStatus) window.updateRegistryStatus();

          } else {
            showToast('Failed to update: ' + (data.message || "Unknown error"), 'error');
            btn.disabled = false;
            btn.innerText = "Save Changes";
          }
        })
        .catch(err => {
          console.error(err);
          showToast('Network error: ' + err.message, 'error');
          btn.disabled = false;
          btn.innerText = "Save Changes";
        });
      }
  }

  // Global Sync State
  window.lastSyncTime = null;

  // Helper to refresh data and then update detail view
  window.refreshPatientDataAndUI = function(targetUid) {
      const team = localStorage.getItem('tb_team_slug') || '';
      const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
      let url = team ? `/api/get_all_data?team=${team}` : '/api/get_all_data';
      
      // Delta Sync: Only request 'since' if we have data and a previous sync time
      if(window.lastSyncTime && window.allPatientData && window.allPatientData.length > 0) {
          url += `&since=${window.lastSyncTime}`;
      }
      
      fetch(url, {
          headers: { 'X-Device-ID': deviceId }
      })
      .then(res => {
          if(res.status === 403) {
              showToast("Access Denied. Resetting to guest permissions.", "error");
              localStorage.removeItem('tb_team_slug');
              localStorage.removeItem('tb_team_name');
              localStorage.removeItem('tb_team_invite_code');
              updateMyTeamUI();
              // Trigger reload to fetch public/user data
              setTimeout(() =>  window.refreshPatientDataAndUI(), 500);
              return { success: false };
          }
          return res.json();
      })
      .then(data => {
          if(data.success) {
              // Update Sync Time
              if(data.timestamp) window.lastSyncTime = data.timestamp;

              // Check Notifications (Persistent Badge & System Push)
              const badge = document.getElementById('teamRequestBadge');
              if(badge) {
                  const pending = (data.stats && data.stats.pending_requests) || 0;
                  const lastPending = window.lastPendingCount || 0;
                  
                  // Restore missing or incorrect Invite Code
                  if(data.stats && data.stats.invite_code) {
                      const existing = localStorage.getItem('tb_team_invite_code');
                      if(existing !== data.stats.invite_code) {
                          localStorage.setItem('tb_team_invite_code', data.stats.invite_code);
                          updateMyTeamUI(); // Refresh UI once code arrives/updates
                      }
                  }
                  
                  // Visual Badge (Persistent)
                  badge.style.display = pending > 0 ? 'block' : 'none';
                  
                  // System Notification (Push)
                  if(pending > lastPending) {
                      if(Notification.permission === "granted") {
                          new Notification("New Team Request", {
                              body: `${pending} user(s) waiting for approval.`,
                              icon: '/static/icon.png' // Fallback if exists
                          });
                      } else if (Notification.permission !== "denied") {
                          Notification.requestPermission().then(permission => {
                              if (permission === "granted") {
                                  new Notification("New Team Request", { body: "Check Team Management." });
                              }
                          });
                      }
                      showToast("🔔 New Join Request received!");
                  }
                  
                  window.lastPendingCount = pending;
              }
              
              if(url.includes('&since=')) {
                  console.log("Partial Sync Received:", data.data.length, "updates", data.deleted.length, "deletions");
                  
                  // 1. Process Deletions
                  if(data.deleted && data.deleted.length > 0) {
                      const delSet = new Set(data.deleted);
                      window.allPatientData = window.allPatientData.filter(p => !delSet.has(p.uid));
                      // Also handle Team deletions if necessary (but that's usually full reload)
                  }
                  
                  // 2. Process Updates/Adds
                  if(data.data && data.data.length > 0) {
                      const updateMap = new Map(data.data.map(p => [p.uid, p]));
                      // Update existing
                      window.allPatientData = window.allPatientData.map(p => updateMap.has(p.uid) ? updateMap.get(p.uid) : p);
                      
                      // Add new (those not in existing list)
                      const existingUids = new Set(window.allPatientData.map(p => p.uid));
                      data.data.forEach(p => {
                          if(!existingUids.has(p.uid)) window.allPatientData.push(p);
                      });
                  }
              } else {
                  // Full Sync
                  window.allPatientData = data.data;
              }

              if(targetUid) window.openPatientDetail(targetUid);
              window.renderPatientList(); // Refresh list/badges too
              
              // Also sync Team List & Dashboard counts & Registry Sidebar during background sync
              window.loadTeams();
              if(window.updateDashboardCounts) window.updateDashboardCounts();
              if(window.updateRegistryStatus) window.updateRegistryStatus();
              if(window.calendar) window.calendar.refetchEvents();
              
              // Persist for offline access
              if(window.persistLocalData) window.persistLocalData();
          }
      })
      .catch(err => {
          console.error("Sync Error:", err);
          showToast("Sync Interrupted", "error");
      });
  }

  // -- Modal Close Logic --
  const modal = document.getElementById('eventModal');
  const closeModalBtn = document.getElementById('closeModal');
  
  closeModalBtn.onclick = () => { modal.style.display = 'none'; }
  window.onclick = (e) => { if (e.target == modal) modal.style.display = 'none'; }


  // -- Collapsible Form Logic --
  const toggleBtn = document.getElementById('toggleFormBtn');
  const patientForm = document.getElementById('patientForm');
  const toggleIcon = toggleBtn.querySelector('span:last-child');
  
  toggleBtn.addEventListener('click', function() {
    const isShowing = patientForm.classList.contains('show');
    if (isShowing) {
      patientForm.classList.remove('show');
      toggleIcon.innerText = "▼"; // Down arrow
    } else {
      patientForm.classList.add('show');
      toggleIcon.innerText = "▲"; // Up arrow
    }
  });


  // -- Milestones Preview Logic --
  const regimeMilestones = { 
    "IR": ["Start", "M2", "M5", "M6/M-end"], 
    "CR": ["Start", "M2", "M5", "M6/M-end"], 
    "RR": ["Start", "M3", "M5", "M8/M-end"] 
  };
  const regimeSelect = document.getElementById("regime");
  const milestonesPreview = document.getElementById("milestonesPreview");

  function updateMilestones() {
    const milestones = regimeMilestones[regimeSelect.value] || ["M1"];
    milestonesPreview.innerText = milestones.join("  ➔  ");
  }
  
  updateMilestones();
  regimeSelect.addEventListener("change", updateMilestones);


  // -- Delete Patient (Custom Modal) --
  let patientIdToDelete = null;
  const deleteModal = document.getElementById('confirmDeleteModal');
  const deleteNameSpan = document.getElementById('deletePatientName');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

  // Open Delete Modal
  const legendList = document.querySelector('#legend ul');
  if (legendList) {
    legendList.addEventListener('click', function(e) {
      if (e.target.classList.contains('deletePatientBtn')) {
        const btn = e.target;
        patientIdToDelete = btn.dataset.id;
        const patientName = btn.closest('li').querySelector('strong').innerText;
        
        if (deleteNameSpan) deleteNameSpan.innerText = patientName;
        if (deleteModal) deleteModal.style.display = 'flex'; // Flex for centering
      }
    });
  }

  // Confirm Delete Action
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', function() {
        if (!patientIdToDelete) return;
        
        const btn = confirmDeleteBtn;
        const originalText = btn.innerText;
        btn.innerText = "Deleting...";
        btn.disabled = true;

        fetch(`/delete_patient/${patientIdToDelete}`, { method: 'POST' })
        .then(res => {
            if(!res.ok) throw new Error("Deletion failed");
            return res.json();
        })
        .then(data => {
            if (data.success) {
                showToast("Patient removed successfully");
                
                const li = document.querySelector(`.deletePatientBtn[data-id="${patientIdToDelete}"]`).closest('li');
                if (li) {
                    li.style.transition = 'all 0.3s ease';
                    li.style.opacity = '0';
                    li.style.transform = 'translateX(20px)';
                    setTimeout(() => {
                        li.remove();
                        const list = document.querySelector('#legend ul');
                        if (list && list.children.length === 0) {
                           list.innerHTML = '<div style="text-align: center; padding: 2rem; color: #475569;"><div style="font-size: 2rem; margin-bottom: 0.5rem;">📭</div>No patients currently enrolled.</div>';
                        }
                    }, 300);
                }

                const ids = ['headerCount', 'totalCount', 'activeCount'];
                ids.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        let val = parseInt(el.innerText || '0');
                        el.innerText = Math.max(0, val - 1);
                    }
                });

                calendar.refetchEvents();
                
                // Reset button and dismiss
                btn.innerText = originalText;
                btn.disabled = false;
                document.getElementById('confirmDeleteModal').style.display = 'none';
                patientIdToDelete = null;

            } else {
                showToast("Error: " + (data.message || "Could not delete"), "error");
                btn.innerText = originalText;
                btn.disabled = false;
            }
        })
        .catch(err => {
            showToast("Network Error: " + err.message, "error");
            btn.innerText = originalText;
            btn.disabled = false;
        });
    });
  }

  // Cancel Delete Action
  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', function() {
        if (deleteModal) deleteModal.style.display = 'none';
        patientIdToDelete = null;
    });
  }
  
  // Close modal if clicking outside
  window.addEventListener('click', function(e) {
    if (e.target === deleteModal) {
      deleteModal.style.display = 'none';
    }
  });

  // -- Add Patient Loading State --
  const addPatientForm = document.getElementById('patientForm');
  if (addPatientForm) {
    addPatientForm.addEventListener('submit', function() {
        const btn = this.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = 'Adding... <span class="spinner"></span>'; 
    });
  }

  // -- WiFi Sync Logic --
  const syncBtn = document.getElementById('wifiSyncBtn');
  const syncModal = document.getElementById('syncModal');
  const closeSyncBtn = document.getElementById('closeSyncModal');
  const deviceNameInput = document.getElementById('myDeviceName');

  // Load Device Name
  if(deviceNameInput) {
      const savedName = localStorage.getItem('tb_device_name');
      if(savedName) deviceNameInput.value = savedName;
      
      deviceNameInput.addEventListener('input', (e) => {
          localStorage.setItem('tb_device_name', e.target.value);
      });
  }

  if (syncBtn && syncModal) {
      syncBtn.onclick = function() {
          syncModal.style.display = 'flex';
          // Auto-start polling if Host tab is active (default)
          if(document.getElementById('hostTab').style.display !== 'none') {
             pollHostInfo();
          }
      }
      // ... (closeBtn logic same) ...
      if (closeSyncBtn) {
          closeSyncBtn.onclick = function() {
              syncModal.style.display = 'none';
          }
      }
      
      // Tabs
      const tabs = document.querySelectorAll('.tab-btn');
      const contents = document.querySelectorAll('.tab-content');
      
      tabs.forEach(tab => {
          tab.addEventListener('click', () => {
              tabs.forEach(t => t.classList.remove('active'));
              contents.forEach(c => c.style.display = 'none');
              
              tab.classList.add('active');
              const target = document.getElementById(tab.dataset.tab + 'Tab');
              if (target) {
                  target.style.display = 'block';
                  if(tab.dataset.tab === 'host') pollHostInfo(); 
              }
          });
      });
  }
  
  window.selectedDevice = 'all';

  // Host Info Polling
  window.pollHostInfo = function() {
      fetch('/api/get_host_info')
      .then(res => res.json())
      .then(data => {
          // Update Hostname
          const hostLabel = document.getElementById('hostNameDisplay');
          if(hostLabel) hostLabel.textContent = `Host: ${data.hostname}`;
          
          // Update Devices List
          const listDiv = document.getElementById('connectedDevicesList');
          
          let html = '<ul style="list-style:none; padding:0; margin:0;">';
          
          // Add "Check All" Option
          const isAll = window.selectedDevice === 'all';
          const bgAll = isAll ? '#e0f2fe' : 'transparent';
          const bdrAll = isAll ? '#0284c7' : 'transparent';
          
          let pendingCount = data.devices.filter(d => d.has_pending).length;
          let pendingBadge = pendingCount > 0 ? `<span style="background:#ef4444; color:white; font-size:0.65rem; padding:1px 5px; border-radius:10px; margin-left:5px;">${pendingCount} sources</span>` : '';
          
          html += `
             <li onclick="selectDevice('all')" style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:8px; cursor:pointer; background:${bgAll}; border-left:3px solid ${bdrAll}; transition: background 0.2s; font-weight:600; color:#334155;">
                <span>👥 All Devices ${pendingBadge}</span>
             </li>
          `;

          if(data.devices.length === 0) {
              if(!pendingCount) html += '<li style="padding:10px; color:#94a3b8; font-style:italic; font-size:0.85rem;">No active connections.</li>';
          } 
          
          data.devices.forEach(d => {
               const isActive = window.selectedDevice === d.name;
               const bg = isActive ? '#e0f2fe' : 'transparent';
               const border = isActive ? '#0284c7' : 'transparent';
               const dot = d.has_pending ? '<span style="width:8px; height:8px; background:#ef4444; border-radius:50%; display:inline-block; margin-left:5px;"></span>' : '';
              
              html += `
                <li onclick="selectDevice('${d.name}')" style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:6px 8px; cursor:pointer; background:${bg}; border-left:3px solid ${border}; transition: background 0.2s;">
                    <span>
                        <span style="font-weight:600; color:#334155;">${d.name}</span>
                        ${dot} 
                        <span style="font-size:0.75rem; color:#94a3b8;">(${d.ip})</span>
                    </span>
                    <span class="badge" style="background:#f1f5f9; color:#475569;">${d.pushes} pushes</span>
                </li>
              `;
          });
          
          html += '</ul>';
          listDiv.innerHTML = html;
      })
      .catch(err => console.log("Host poll error", err));
  }

  window.selectDevice = function(name) {
      window.selectedDevice = name;
      pollHostInfo(); // Re-render to show highlight
      checkIncoming(name); // Load data
  }

  // Guest & Host Actions
  window.getHostUrl = function() {
        const hostInput = document.getElementById('hostIpInput');
        let url = hostInput.value.trim();
        if (!url) return null;
        
        // Auto-add protocol
        if (!url.startsWith('http')) {
            url = 'http://' + url;
        }
        
        // Auto-add port 5000 ONLY for IP addresses or localhost without port
        // Skip for onrender.com, vercel.app, etc.
        const chk = url.split('://')[1] || url;
        const isCloud = chk.includes('.') && 
                       (chk.includes('onrender.com') || 
                        chk.includes('vercel.app') || 
                        chk.includes('herokuapp.com'));
        
        if (!chk.includes(':') && !isCloud) {
            url = url + ':5000';
        }

        return url;
  }
  
  // -- Network Scanner --
  window.findHostServer = function() {
      const btn = document.getElementById('findHostBtn');
      const statusInfo = document.getElementById('scanStatus');
      const hostInput = document.getElementById('hostIpInput');
      
      // Determine Subnet from current location if possible, or common defaults
      // If we are served from x.x.x.x, likely host is on that subnet.
      // But P2P often means we are localhost, and host is 192.168.1.x
      // We'll try to guess based on user input or common patterns.
      
      // Since JS cannot easily get local IP, we scan common subnets:
      // 192.168.1.x, 192.168.0.x, 192.168.100.x
      // Better: Ask user for "Base" or just scan 192.168.1.1-255 first.
      
      // Let's assume standard 192.168.1.x for now as it's most common
      let base = "192.168.1";
      
      // If user typed something, use that as base
      const existing = hostInput.value.trim();
      if(existing && existing.length > 7) {
          const parts = existing.split('.');
          if (parts.length >= 3) base = `${parts[0]}.${parts[1]}.${parts[2]}`;
      }
      
      btn.disabled = true;
      statusInfo.style.display = 'block';
      statusInfo.innerHTML = `Scanning ${base}.x ... <span class="spinner" style="width:12px; height:12px;"></span>`;
      
      let found = false;
      let activeScans = 0;
      const timeoutVal = 1500;
      
      for(let i=1; i<255; i++) {
          if(found) break;
          const targetIp = `${base}.${i}`;
          const targetUrl = `http://${targetIp}:5000/api/get_host_info`;
          
          activeScans++;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutVal);
          
          fetch(targetUrl, { signal: controller.signal })
          .then(res => {
              if(res.ok) return res.json();
              throw new Error("Not host");
          })
          .then(data => {
              if(data.hostname && !found) {
                  found = true;
                  hostInput.value = targetIp; // Autofill just IP
                  statusInfo.innerHTML = `✅ Found: ${data.hostname} (${targetIp})`;
                  statusInfo.style.color = 'var(--success)';
                  showToast(`Found Server: ${data.hostname}`);
                  btn.disabled = false;
              }
          })
          .catch(() => {
              // Ignore timeouts/errors
          })
          .finally(() => {
             activeScans--;
             if(activeScans === 0 && !found) {
                 btn.disabled = false;
                 statusInfo.innerHTML = `❌ No server found on ${base}.x range. Try entering IP manually.`;
                 statusInfo.style.color = 'var(--danger)';
             }
          });
      }
  }

  window.fetchFromHost = function(action) {
      const host = window.getHostUrl();
      const statusDiv = document.getElementById('connectionStatus');
      
      if (!host) { showToast("Please enter Host IP", "error"); return; }
      
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = `<span class="spinner"></span> Fetching from ${host}...`;
      
      const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
      
      // We are fetching ALL data from host
      fetch(`${host}/api/get_all_data`, {
          headers: { 'X-Device-ID': deviceId }
      })
      .then(res => {
          if(res.status === 403) throw new Error("Host Sync Forbidden");
          return res.json();
      })
      .then(data => {
          if (!data.success) throw new Error(data.message || "Host Error");
          
          statusDiv.innerHTML = `Received ${data.data.length} records. Merging...`;
          
          // Send to our OWN backend to merge
          return fetch('/api/merge_data', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                  source_device: "HOST_SYNC",
                  data: data.data,
                  deleted: data.deleted,
                  strategy: action // 'APPEND' or 'REPLACE'
              })
          });
      })
      .then(res => res.json())
      .then(res => {
          if(res.success) {
              showToast(`Sync Complete! Added/Updated: ${res.added}, Deleted: ${res.deleted}`);
              statusDiv.innerHTML = `✅ Sync Success! Reloading...`;
              statusDiv.style.color = 'var(--success)';
              // Reload to update views
              setTimeout(() => window.location.reload(), 1500);
          } else {
              throw new Error(res.message);
          }
      })
      .catch(err => {
          console.error(err);
          statusDiv.innerHTML = `❌ Sync Failed: ${err.message}`;
          statusDiv.style.color = 'var(--danger)';
          showToast(err.message, "error");
      });
  }

  window.pushToHost = function() {
          const host = window.getHostUrl();
          const statusDiv = document.getElementById('connectionStatus');
          const myName = document.getElementById('myDeviceName').value || "Guest Device";
          
          if (!host) { showToast("Please enter Host IP", "error"); return; }
          
          statusDiv.style.display = 'block';
          statusDiv.innerHTML = '<span class="spinner"></span> Packaging local data...';
          
          const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
          
          fetch('/api/get_all_data', {
              headers: { 'X-Device-ID': deviceId }
          })
          .then(res => {
              if(res.status === 403) throw new Error("Sync Access Forbidden");
              return res.json();
          })
          .then(local => {
              statusDiv.innerHTML = `Sending ${local.data.length} records to Host (${host})...`;
              return fetch(`${host}/api/stage_incoming`, {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({ 
                      data: local.data, 
                      deleted: local.deleted,
                      teams: local.teams || [], // Pass teams
                      members: local.members || [], // Pass members
                      device_name: myName
                  }) 
              });
          })
          .then(res => res.json())
          .then(res => {
              if (res.success) {
                  showToast("Sent to Host for Review!");
                  statusDiv.innerHTML = '✅ Sent! Ask Host to review.';
              } else { throw new Error(res.message); }
          })
          .catch(err => {
             console.error(err);
             let msg = "Connection Failed";
             if(err.message.includes("Failed to fetch")) msg = "Could not connect to Host. Check IP & Port.";
             statusDiv.innerHTML = `❌ ${msg}`;
             showToast(msg, "error");
          });
  }

  window.checkIncoming = function(deviceName) {
          const container = document.getElementById('reviewContainer');
          const btn = document.getElementById('checkUpdatesBtn');
          
          if(!deviceName) deviceName = window.selectedDevice || 'all';
          const displayTitle = deviceName === 'all' ? 'All Devices' : deviceName;
          
          if(btn) btn.innerHTML = '🔄 Checking... <span class="spinner"></span>';
          container.innerHTML = `<span class="spinner"></span> Fetching updates (${displayTitle})...`;
          
          fetch(`/api/get_staged_data?device=${encodeURIComponent(deviceName)}&_=${Date.now()}`)
          .then(res => {
              if(!res.ok) throw new Error(`Server Error: ${res.status}`);
              return res.json();
          })
          .then(data => {
              if(!data.success && data.message) throw new Error(data.message);
              
              const list = data.data || [];
              let newCount = 0;
              let updateCount = 0;
              let deleteCount = 0;
              
              list.forEach(p => {
                  if(p.status === 'NEW') newCount++;
                  if(p.status === 'UPDATE') updateCount++;
                  if(p.status === 'DELETE') deleteCount++;
              });

              if (list.length === 0) {
                  container.innerHTML = '<div style="color:#64748b; font-style:italic;">No pending updates from this device.</div>';
                  if(btn) btn.innerHTML = '🔄 Update List';
                  return;
              }
              
              const totalItems = list.length;
              if(btn) btn.innerHTML = `🔄 Updates: ${totalItems} items`;
              
              let html = `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px; margin-bottom:10px; font-size:0.85rem; display:flex; gap:10px; align-items:center;">
                    <div style="font-weight:600; color:#334155;">Summary:</div>
                    <div style="color:#10b981;">New: ${newCount}</div>
                    <div style="color:#3b82f6;">Updates: ${updateCount}</div>
                    <div style="color:#ef4444;">Deleted: ${deleteCount}</div>
                    <div style="margin-left:auto; font-size:0.75rem; color:#94a3b8;">${displayTitle}</div>
                </div>

                <div style="display:flex; gap:8px; margin-bottom:8px;">
                    <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="toggleSyncChecks('all')">All</button>
                    <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="toggleSyncChecks('new')">New</button>
                    <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="toggleSyncChecks('update')">Updates</button>
                    <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="toggleSyncChecks('delete')">Del</button>
                    <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="toggleSyncChecks('none')">None</button>
                </div>
                <div style="max-height: 250px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:4px; margin-bottom:10px;">
              `;
              
              data.data.forEach((p, idx) => {
                  let tag = '';
                  let style = '';
                  let checked = 'checked';
                  
                  if (p.status === 'NEW') {
                      tag = '<span style="color:#10b981; font-weight:700; font-size:0.7rem; margin-left:auto;">(New)</span>';
                      style = 'font-weight:600; background:#f0fdf4;';
                  } else if (p.status === 'UPDATE') {
                      tag = '<span style="color:#3b82f6; font-weight:700; font-size:0.7rem; margin-left:auto;">(Update)</span>';
                      style = 'font-weight:500; background:#eff6ff;';
                  } else if (p.status === 'DELETE') {
                      tag = '<span style="color:#ef4444; font-weight:700; font-size:0.7rem; margin-left:auto;">(DELETE)</span>';
                      style = 'text-decoration: line-through; opacity: 0.8; background:#fef2f2; color:#b91c1c;';
                  } else {
                      tag = '<span style="color:#94a3b8; font-size:0.7rem; margin-left:auto;">(Same)</span>';
                      style = 'opacity: 0.6; color:#64748b;';
                      checked = ''; 
                  }

                  const uidShort = p.uid ? `<span style="font-family:monospace; font-size:0.65rem; color:#94a3b8; margin-left:4px;">#${p.uid.slice(0,4)}</span>` : '';
                  const devName = p.source_device || deviceName;
                  const deviceBadge = `<span style="background:#e2e8f0; color:#475569; padding:2px 4px; border-radius:4px; font-size:0.65rem; margin-right:6px;">${devName}</span>`;

                  const valObj = { d: p.source_device || deviceName, i: (p.idx !== undefined ? p.idx : idx) };
                  const val = encodeURIComponent(JSON.stringify(valObj));

                  html += `
                    <div style="padding: 4px 8px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; ${style}">
                        <input type="checkbox" class="sync-check" value="${val}" data-status="${p.status}" ${checked} onchange="updateMergeCount()"> 
                        <span style="margin-left: 8px; font-size:0.9rem;">${p.name}</span>
                        ${deviceBadge}
                        ${uidShort}
                        ${tag}
                    </div>
                  `;
              });
              html += '</div>';
              html += `<button id="mergeBtn" class="btn" style="width:100%;" onclick="acceptSelected()">Merge Selected (${totalItems})</button>`;
              
              container.innerHTML = html;
              updateMergeCount(); // Initialize count
          })
          .catch(err => {
              console.error("CheckIncoming Error:", err);
              container.innerHTML = `<div style="color:var(--danger); padding:10px;">❌ Error fetching updates: ${err.message}</div>`;
              if(btn) btn.innerHTML = '🔄 Retry List';
          });
  }

  window.updateMergeCount = function() {
      const checks = document.querySelectorAll('.sync-check:checked');
      const btn = document.getElementById('mergeBtn');
      if(btn) btn.textContent = `Merge Selected (${checks.length})`;
  }

  window.acceptSelected = function() {
          const checks = document.querySelectorAll('.sync-check:checked');
          if(checks.length === 0) { showToast("No items selected"); return; }
          
          // Group by device
          const commits = {}; 
          
          checks.forEach(c => {
              try {
                  const obj = JSON.parse(decodeURIComponent(c.value));
                  if(!commits[obj.d]) commits[obj.d] = [];
                  commits[obj.d].push(obj.i);
              } catch(e) { console.error("Parse error", c.value); }
          });
          
          fetch('/api/commit_staged', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ 
                  commits_by_device: commits
              })
          })
          .then(res => res.json())
          .then(data => {
               if(data.success) {
                  showToast(`Merged ${data.count} records! Reloading...`);
                  checkIncoming(window.selectedDevice);
                  // Reload to update Calendar/Lists
                  setTimeout(() => window.location.reload(), 1500);
               } else {
                   showToast("Error: " + data.message, "error");
               }
          })
          .catch(err => showToast("Network Error", "error"));
  }

});

// -- Dynamic Dashboard Logic --
window.updateDashboardCounts = function() {
    const teamSlug = localStorage.getItem('tb_team_slug') || 'DEFAULT';
    const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
    
    fetch(`/api/get_all_data?team=${teamSlug}`, {
        headers: { 'X-Device-ID': deviceId }
    })
    .then(res => {
        if(res.status === 403) {
            // Silently ignore or handle 403 for dashboard background updates
            return { success: false, access_denied: true };
        }
        if(!res.ok) throw new Error("Dashboard sync failed");
        return res.json();
    })
    .then(data => {
        if (data.access_denied) return; // Stop if forbidden
        
        if(data.success) {
            window.allPatientData = data.data; // Sync global store
            
            const total = data.data.length;
            let active = 0;
            let cured = 0;
            
            data.data.forEach(p => {
                const sortedEvents = [...p.events].sort((a,b) => new Date(a.start) - new Date(b.start));
                const lastEvent = sortedEvents.length > 0 ? sortedEvents[sortedEvents.length-1] : null;
                
                if(!lastEvent) {
                    active++;
                } else {
                    const out = (lastEvent.outcome || "").trim();
                    if(out === "") {
                        active++;
                    } else if (out === 'Cured' || out === 'Completed') {
                        cured++;
                    }
                }
            });
            
            const totalEl = document.getElementById('totalCount');
            const activeEl = document.getElementById('activeCount');
            const curedEl = document.getElementById('curedCount');
            const headerEl = document.getElementById('headerCount');
            
            if(totalEl) totalEl.innerText = total;
            if(activeEl) activeEl.innerText = active;
            if(curedEl) curedEl.innerText = cured;
            if(headerEl) headerEl.innerText = total;
        }
    })
    .catch(err => {
        console.warn("Dashboard update suppressed during transit/error:", err.message);
    });
}

// -- Patient List & Detail View Logic --
// -- Patient Data Persistence --
window.allPatientData = [];
window.lastSyncTime = localStorage.getItem('tb_last_sync_time');

window.persistLocalData = function() {
    try {
        const team = localStorage.getItem('tb_team_slug') || 'DEFAULT';
        localStorage.setItem('tb_all_patient_data', JSON.stringify(window.allPatientData));
        localStorage.setItem('tb_all_patient_data_team', team);
        if(window.lastSyncTime) {
            localStorage.setItem('tb_last_sync_time', window.lastSyncTime);
        }
    } catch (e) {
        console.warn("Failed to persist data to localStorage:", e);
    }
};

window.hydrateLocalData = function() {
    try {
        const currentTeam = localStorage.getItem('tb_team_slug') || 'DEFAULT';
        const cachedTeam = localStorage.getItem('tb_all_patient_data_team');
        const cached = localStorage.getItem('tb_all_patient_data');
        
        if(cached && currentTeam === cachedTeam) {
            window.allPatientData = JSON.parse(cached);
            console.log(`[PWA] Hydrated ${window.allPatientData.length} patients from cache.`);
            
            // Immediate UI update from cache
            if(window.renderPatientList) window.renderPatientList();
            if(window.updateDashboardCounts) window.updateDashboardCounts();
            if(window.updateRegistryStatus) window.updateRegistryStatus();
            if(window.calendar) window.calendar.refetchEvents();
        } else {
            console.log("[PWA] No valid cache for current team.");
        }
    } catch (e) {
        console.error("Hydration failed:", e);
    }
};


window.openPatientList = function(initialFilter = 'all') {
    const modal = document.getElementById('patientListModal');
    modal.style.display = 'flex';
    
    // Set filter if provided, otherwise default to all
    const filterSelect = document.getElementById('patientFilter');
    if(filterSelect) filterSelect.value = initialFilter;
    
    document.getElementById('patientListContainer').innerHTML = '<div style="padding:20px; text-align:center;"><span class="spinner"></span> Loading...</div>';
    
    const team = localStorage.getItem('tb_team_slug') || '';
    const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
    const url = team ? `/api/get_all_data?team=${team}` : '/api/get_all_data';

    fetch(url, {
        headers: { 'X-Device-ID': deviceId }
    })
    .then(res => {
        if(res.status === 403) {
            showToast("Access Denied. Resetting team view.", "error");
            localStorage.removeItem('tb_team_slug');
            localStorage.removeItem('tb_team_name');
            localStorage.removeItem('tb_team_invite_code');
            updateMyTeamUI();
            // Try again with guest view
            setTimeout(() => window.openPatientList(initialFilter), 500);
            return { success: false, handled: true };
        }
        if(!res.ok) throw new Error("Failed to load patient list");
        return res.json();
    })
    .then(data => {
        if (data.handled) return;
        if(data.success) {
            window.allPatientData = data.data; // Store globally for filtering
            renderPatientList();
        } else {
            showToast("Error: " + (data.message || "Failed to load"), "error");
            document.getElementById('patientListContainer').innerHTML = `<div style="color:red; padding:20px;">Error: ${data.message}</div>`;
        }
    })
    .catch(err => {
        showToast("Network Error: " + err.message, "error");
        document.getElementById('patientListContainer').innerHTML = `<div style="color:red; padding:20px;">Network Error</div>`;
    });
}

window.renderPatientList = function() {
    const container = document.getElementById('patientListContainer');
    const search = document.getElementById('patientSearch').value.toLowerCase();
    const filter = document.getElementById('patientFilter').value;
    const monthFilter = document.getElementById('patientMonthFilter').value; // YYYY-MM
    const sort = document.getElementById('patientSort').value;
    const countEl = document.getElementById('patientListCount');
    
    let list = [...window.allPatientData];
    
    // 1. Search (Name or UID)
    if(search) {
        list = list.filter(p => p.name.toLowerCase().includes(search) || (p.uid && p.uid.includes(search)));
    }
    
    // 2. Status Filter
    if(filter !== 'all') {
        list = list.filter(p => {
             // Sort to find last event
             const sorted = [...p.events].sort((a,b) => new Date(a.start) - new Date(b.start));
             const last = sorted.length > 0 ? sorted[sorted.length-1] : null;
             
             // Active = No events OR Last event has no outcome
             const isActive = !last || !last.outcome || last.outcome.trim() === "";
             
             if(filter === 'active') return isActive;
             if(filter === 'outcome') return !isActive; // Any outcome (Cured, Completed, Died, etc.)
             if(filter === 'completed') {
                 return last && (last.outcome === 'Cured' || last.outcome === 'Completed');
             }
             return true;
        });
    }

    // 3. Month Filter (Any event in month)
    if(monthFilter) {
        list = list.filter(p => {
            return p.events.some(e => e.start.startsWith(monthFilter));
        });
    }

    // 4. Update Count
    if(countEl) {
        countEl.innerText = `Showing ${list.length} of ${window.allPatientData.length} patients`;
    }

    // 5. Sort
    list.sort((a, b) => {
        if(sort === 'name') return a.name.localeCompare(b.name);
        if(sort === 'age') return a.age - b.age;
        if(sort === 'newest') return 0; // Keeping as is
        return 0;
    });

    // 6. Render
    let html = '<div style="display:flex; flex-direction:column;">';
    list.forEach(p => {
        // Status Badge Logic
        const sorted = [...p.events].sort((a,b) => new Date(a.start) - new Date(b.start));
        const lastEvent = sorted.length > 0 ? sorted[sorted.length-1] : null;
        
        let statusBadge = '<span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:10px; font-size:0.7rem;">Active</span>';
        
        if (lastEvent && lastEvent.outcome && lastEvent.outcome.trim() !== "") {
             const out = lastEvent.outcome;
             let color = '#3b82f6'; // Blue default
             if(out === 'Died' || out === 'Failed') color = '#ef4444';
             else if (out === 'Cured' || out === 'Completed') color = '#10b981';
             
             statusBadge = `<span style="background:${color}20; color:${color}; padding:2px 6px; border-radius:10px; font-size:0.7rem;">${out}</span>`;
        }

        html += `
        <div onclick="openPatientDetail('${p.uid || ''}')" style="padding:12px; border-bottom:1px solid #f1f5f9; display:flex; align-items:center; cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <div style="width:40px; height:40px; background:#e2e8f0; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:600; color:#64748b; margin-right:12px;">
                ${p.name.charAt(0).toUpperCase()}
            </div>
            <div style="flex:1;">
                <div style="font-weight:600; color:#334155;">${p.name} <span style="font-weight:400; color:#94a3b8; font-size:0.8rem;">(${p.age}, ${p.sex})</span></div>
                <div style="font-size:0.8rem; color:#64748b;">${p.regime} • ${p.address || 'No Address'}</div>
            </div>
            <div>
               ${statusBadge}
            </div>
            <div style="margin-left:10px; color:#cbd5e1;">›</div>
        </div>
        `;
    });
    html += '</div>';
    
    if(list.length === 0) html = '<div style="padding:30px; text-align:center; color:#94a3b8;">No patients found matching filters.</div>';
    
    container.innerHTML = html;
}

window.openPatientDetail = function(uid) {
    // If no UID, we have a problem (legacy data?). Try matching name? Ideally UID exists.
    const p = window.allPatientData.find(x => x.uid === uid);
    if(!p) return;

    const modal = document.getElementById('patientDetailModal');
    const title = document.getElementById('pdName');
    const head = document.getElementById('pdHeader');
    const timeline = document.getElementById('pdTimeline');
    
    title.innerText = p.name;
    
    // Header
    head.innerHTML = `
        <div style="flex:1;">
            <div style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Age/Sex</div>
            <div style="font-weight:600;">${p.age} / ${p.sex}</div>
        </div>
        <div style="flex:1;">
            <div style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Address</div>
            <div style="font-weight:600;">${p.address || '-'}</div>
        </div>
        <div style="flex:1;">
            <div style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Regime</div>
            <div style="font-weight:600;">${p.regime}</div>
        </div>
    `;
    
    // Timeline
    let tlHtml = '';
    // Sort events by date
    const events = [...p.events].sort((a,b) => new Date(a.start) - new Date(b.start));
    
    if(events.length === 0) {
        tlHtml = '<div style="font-style:italic; color:#94a3b8;">No recorded events.</div>';
    } else {
        tlHtml = '<div style="position:relative; padding-left:20px; border-left:2px solid #e2e8f0; margin-left:10px;">';
        events.forEach(e => {
            const date = new Date(e.start).toLocaleDateString();
            const color = e.color || '#cbd5e1';
            const outcome = e.outcome ? `<span style="font-weight:700; color:${color};">(${e.outcome})</span>` : '';
            
            tlHtml += `
            <div style="position:relative; margin-bottom:20px;">
                <div style="position:absolute; left:-25px; top:0; width:10px; height:10px; background:${color}; border-radius:50%; border:2px solid white;"></div>
                <div style="font-size:0.8rem; font-weight:700; color:#64748b;">${date}</div>
                <div onclick="editTimelineEvent('${p.uid}', '${e.id}')" 
                     style="background:white; border:1px solid #f1f5f9; padding:8px; border-radius:6px; box-shadow:0 1px 2px rgba(0,0,0,0.05); cursor:pointer; transition:transform 0.1s, box-shadow 0.1s;"
                     onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 6px -1px rgba(0,0,0,0.1)';"
                     onmouseout="this.style.transform='none'; this.style.boxShadow='0 1px 2px rgba(0,0,0,0.05)';"
                     title="Click to Edit Record">
                    <div style="font-weight:600; color:#334155;">${e.title} ${outcome}</div>
                    <div style="font-size:0.85rem; color:#64748b;">${e.remark || ''}</div>
                </div>
            </div>
            `;
        });
        tlHtml += '</div>';
    }
    
    timeline.innerHTML = tlHtml;
    modal.style.display = 'flex';
}

// Wire up events for the new modals
// Wire up events for the new modals
document.addEventListener('DOMContentLoaded', () => {
    // Total Patients Card Click
    const totalCard = document.getElementById('totalPatientsCard');
    if(totalCard) {
        totalCard.onclick = () => window.openPatientList('all'); 
    }
    
    // Active Card Click
    const activeCard = document.getElementById('activeCard');
    if(activeCard) {
        activeCard.onclick = () => window.openPatientList('active');
    }

    // Outcomes Card Click
    const outcomesCard = document.getElementById('outcomesCard');
    if(outcomesCard) {
        outcomesCard.onclick = () => window.openPatientList('completed');
    }

    // Close buttons
    const closeList = document.getElementById('closePatientList');
    if(closeList) closeList.onclick = () => document.getElementById('patientListModal').style.display = 'none';
    
    const closeDetail = document.getElementById('closePatientDetail');
    if(closeDetail) closeDetail.onclick = () => document.getElementById('patientDetailModal').style.display = 'none';

    // Inputs
    const search = document.getElementById('patientSearch');
    const filter = document.getElementById('patientFilter');
    const monthFilter = document.getElementById('patientMonthFilter');
    const sort = document.getElementById('patientSort');
    
    if(search) search.addEventListener('input', () => window.renderPatientList());
    if(filter) filter.addEventListener('change', () => window.renderPatientList());
    if(monthFilter) monthFilter.addEventListener('change', () => window.renderPatientList());
    if(sort) sort.addEventListener('change', () => window.renderPatientList());
    
    // Myanmar Toggle
    const mToggle = document.getElementById('toggleMyanmarDetails');
    if(mToggle) {
        mToggle.addEventListener('change', () => {
            if(window.calendar) {
                // Force immediate refetch
                window.calendar.refetchEvents();
            }
        });
    }

    // Sidebar Search
    const regSearch = document.getElementById('registrySearch');
    if(regSearch) {
        regSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const items = document.querySelectorAll('#registryList .patient-item');
            items.forEach(item => {
                const name = item.getAttribute('data-name');
                const uid = item.getAttribute('data-uid');
                const isMatch = name.includes(term) || (uid && uid.toLowerCase().includes(term));
                const inTeam = !window.currentTeamUids || window.currentTeamUids.has(uid);
                
                if(isMatch && inTeam) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    // Initial Patient Status/Progress Update
    updateRegistryStatus();
    
    // Close on outside click
    window.addEventListener('click', (e) => {
        const m1 = document.getElementById('patientListModal');
        const m2 = document.getElementById('patientDetailModal');
        if(e.target === m1) m1.style.display = 'none';
        if(e.target === m2) m2.style.display = 'none';
    });
    
    // Initial Dashboard Update
    window.updateDashboardCounts();
});
window.updateRegistryStatus = async function(viewStart, viewEnd) {
    // Auto-detect current view if not provided (e.g. background sync)
    if(!viewStart && !viewEnd && window.calendar) {
        const view = window.calendar.view;
        viewStart = view.activeStart;
        viewEnd = view.activeEnd;
    }
    
    console.log(`[Registry Update] Filtering for: ${viewStart?.toLocaleDateString()} to ${viewEnd?.toLocaleDateString()}`);

    try {
        const team = localStorage.getItem('tb_team_slug') || '';
        const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
        const url = team ? `/api/get_all_data?team=${team}` : '/api/get_all_data';
        
        const response = await fetch(url, {
            headers: { 'X-Device-ID': deviceId }
        });
        
        if (response.status === 403) {
            console.warn("Registry update blocked: 403 Forbidden");
            return;
        }
        
        const rData = await response.json();
        const patients = rData.data || [];
        window.currentTeamUids = new Set(patients.map(p => p.uid));
        
        // Hide all sidebar items first
        document.querySelectorAll('.patient-item').forEach(li => {
            li.style.display = 'none';
        });
        
        patients.forEach(p => {
            // View-based filtering: Only show patients with events in the current view
            if(viewStart && viewEnd) {
                const hasEventInView = (p.events || []).some(e => {
                    const eDate = new Date(e.start);
                    return eDate >= viewStart && eDate <= viewEnd;
                });
                if(!hasEventInView) return; // Skip if no events in view
            }

            const itemEl = document.querySelector(`.patient-item[data-uid="${p.uid}"]`);
            if(itemEl) {
                itemEl.style.display = 'block';
                
                // Add hover & click listeners for yearly dot highlighting if not already added
                if(!itemEl.dataset.hlInit) {
                    const highlight = (active) => {
                        const dots = document.querySelectorAll('.month-event-dot');
                        const grid = document.getElementById('year-summary-grid');
                        if(active) {
                            dots.forEach(d => {
                                if(d.dataset.patientUid === p.uid) {
                                    d.classList.add('dot-highlight');
                                    d.classList.remove('dot-dim');
                                } else {
                                    d.classList.add('dot-dim');
                                    d.classList.remove('dot-highlight');
                                }
                            });
                            grid?.classList.add('grid-dimming');
                        } else {
                            dots.forEach(d => d.classList.remove('dot-highlight', 'dot-dim'));
                            grid?.classList.remove('grid-dimming');
                        }
                    };

                    itemEl.addEventListener('mouseenter', () => !itemEl.classList.contains('item-selected') && highlight(true));
                    itemEl.addEventListener('mouseleave', () => !itemEl.classList.contains('item-selected') && highlight(false));
                    
                    itemEl.addEventListener('click', (e) => {
                        // Toggle selected state for touch/persistent highlight
                        const isSelected = itemEl.classList.toggle('item-selected');
                        
                        // Clear others
                        document.querySelectorAll('.patient-item').forEach(other => {
                            if(other !== itemEl) other.classList.remove('item-selected');
                        });
                        
                        highlight(isSelected);
                    });
                    
                    itemEl.dataset.hlInit = 'true';
                }
            }

            const statusEl = document.getElementById(`status-${p.uid}`);
            const progressEl = document.getElementById(`progress-${p.uid}`);
            const progressText = document.getElementById(`progress-text-${p.uid}`);
            
            if(!statusEl) return;

            // 1. Calculate Status
            const events = p.events || [];
            // Sort events by date
            const sorted = [...events].sort((a,b) => new Date(a.start) - new Date(b.start));
            const last = sorted.length > 0 ? sorted[sorted.length - 1] : null;
            
            let status = 'Active';
            let badgeClass = 'badge-active';
            
            if(last && (last.outcome === 'Cured' || last.outcome === 'Completed')) {
                status = 'Completed';
                badgeClass = 'badge-completed';
            }
            
            statusEl.innerHTML = `<span class="badge ${badgeClass}">${status}</span>`;
            
            // 2. Calculate Progress
            if(sorted.length > 0) {
                const start = new Date(sorted[0].start);
                const now = new Date();
                const totalDays = 180; // Default treatment span
                const elapsed = Math.max(0, (now - start) / (1000 * 60 * 60 * 24));
                const percent = Math.min(100, Math.round((elapsed / totalDays) * 100));
                
                if(progressEl) progressEl.style.width = `${percent}%`;
                if(progressText) progressText.innerText = `${percent}% Treated (${Math.round(elapsed)}d / ${totalDays}d)`;
            } else {
                if(progressEl) progressEl.style.width = '0%';
                if(progressText) progressText.innerText = 'No events recorded';
            }
        });
    } catch (e) {
        console.error("Failed to update registry status:", e);
    }
}

// -- Helper for Timeline Interactions --
window.editTimelineEvent = function(uid, eventId) {
    // 1. Find patient
    const p = window.allPatientData.find(x => x.uid === uid);
    if(!p) {
        console.error("Patient not found for uid:", uid);
        return;
    }
    
    // 2. Find event
    // Note: eventId might be string or int, so use ==
    const evt = p.events.find(e => e.id == eventId);
    if(!evt) {
        console.error("Event not found:", eventId);
        return;
    }

    // 3. Construct eventData matching FullCalendar structure
    const eventData = {
        id: evt.id,
        title: evt.title,
        startStr: evt.start, 
        backgroundColor: evt.color || 'var(--primary)',
        extendedProps: {
            outcome: evt.outcome,
            remark: evt.remark,
            missed_days: evt.missed_days,
            patient: p // Included just in case
        }
    };
    
    // 4. Open Editor
    if(window.openEventEditor) {
        window.openEventEditor(eventData, p);
    } else {
        console.error("openEventEditor not defined");
    }
}

// --- UI Helpers for Event Form ---
window.selectOutcome = function(el) {
    // 1. Update Hidden Input
    const val = el.getAttribute('data-value');
    document.getElementById('modalOutcome').value = val;
    
    // 2. Visual Selection
    document.querySelectorAll('.outcome-option').forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
}

window.adjustMissed = function(delta) {
    const input = document.getElementById('modalMissedDays');
    let val = parseInt(input.value || 0);
    val += delta;
    if(val < 0) val = 0; // Negative delay allowed? Usually not.
    input.value = val;
    
    // Trigger input event to update date preview
    input.dispatchEvent(new Event('input'));
}

// --- FORM HANDLING ---
const patientForm = document.getElementById('patientForm');
if(patientForm) {
    patientForm.addEventListener('submit', function(e) {
        // Inject current team ID
        const teamSlug = localStorage.getItem('tb_team_slug') || 'DEFAULT';
        const teamInput = document.getElementById('patient_team_id');
        if(teamInput) teamInput.value = teamSlug;
    });
}

// --- Team Management Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const teamsBtn = document.getElementById('teamsBtn');
    const teamsModal = document.getElementById('teamsModal');
    const closeTeamsBtn = document.getElementById('closeTeamsModal');
    
    if(teamsBtn) {
        teamsBtn.addEventListener('click', () => {
            teamsModal.style.display = 'flex'; // Centered
            loadTeams();
            updateMyTeamUI();
        });
    }
    
    if(closeTeamsBtn) closeTeamsBtn.onclick = () => teamsModal.style.display = 'none';
    
    // Join Code Lookup (Real-time Preview)
    const joinCodeInput = document.getElementById('joinTeamCode');
    const previewDiv = document.getElementById('joinCodePreview');
    if(joinCodeInput && previewDiv) {
        joinCodeInput.addEventListener('input', (e) => {
            const code = e.target.value.trim().toUpperCase();
            if(code.length === 7) {
                previewDiv.innerHTML = '<span style="color:#64748b;">🔍 Looking up...</span>';
                fetch(`/api/teams/lookup?code=${code}`)
                .then(res => {
                    if(!res.ok) throw new Error("Lookup failed");
                    return res.json();
                })
                .then(data => {
                    if(data.success) {
                        previewDiv.innerHTML = `<span style="color:#16a34a;">✅ Found: ${data.team_name}</span>`;
                    } else {
                        previewDiv.innerHTML = '<span style="color:#dc2626;">❌ Team not found</span>';
                    }
                })
                .catch(() => {
                    previewDiv.innerHTML = '<span style="color:#dc2626;">⚠️ Error checking code</span>';
                });
            } else {
                previewDiv.innerHTML = '';
            }
        });
    }
    
    // Create Team
    const createBtn = document.getElementById('createTeamBtn');
    if(createBtn) {
        createBtn.onclick = function() {
              const nameInput = document.getElementById('newTeamName');
              const publicCtx = document.getElementById('newTeamPublic');
              
              const name = nameInput.value.trim();
              const isPublic = publicCtx ? publicCtx.checked : false;

              if(!name) return showToast("Enter a team name", "error");
              
              createBtn.innerHTML = "Creating... <span class='spinner'></span>";
              createBtn.disabled = true;
              
              const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
              
              fetch('/api/teams/create', {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({ name: name, user_name: 'Admin', device_id: deviceId, is_public: isPublic })
              })
              .then(res => {
                  if(!res.ok) throw new Error("Failed to create team");
                  return res.json();
              })
              .then(data => {
                  createBtn.innerHTML = "Create Team";
                  createBtn.disabled = false;
                  if(data.success) {
                      showToast(`Team Created! Code: ${data.invite_code}`);
                      nameInput.value = '';
                      if(publicCtx) publicCtx.checked = false;

                      localStorage.setItem('tb_team_slug', data.team_slug);
                      localStorage.setItem('tb_team_name', name);
                      if(data.invite_code) localStorage.setItem('tb_team_invite_code', data.invite_code);
                      
                      updateMyTeamUI();
                      loadTeams(); // Refresh list
                  } else {
                      showToast(data.message || "Creation failed", "error");
                  }
              })
              .catch(err => {
                  createBtn.innerHTML = "Create Team";
                  createBtn.disabled = false;
                  showToast("Connection Error: " + err.message, "error");
              });
        };
    }
    
    // Search Filter
    const searchInp = document.getElementById('searchTeamInput');
    if(searchInp) {
        searchInp.addEventListener('input', (e) => {
             const term = e.target.value.toLowerCase();
             document.querySelectorAll('.team-list-item').forEach(item => {
                 const txt = item.innerText.toLowerCase();
                 item.style.display = txt.includes(term) ? 'flex' : 'none';
             });
        });
    }

    // --- PREMIUM UI: Sidebar Search ---
    const registrySearch = document.getElementById('registrySearch');
    if(registrySearch) {
        registrySearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#registryList .patient-item').forEach(item => {
                const name = item.dataset.name || "";
                const uid = (item.dataset.uid || "").toLowerCase();
                if(name.includes(term) || uid.includes(term)) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    // --- PREMIUM UI: Progress Bars ---
    setTimeout(updateSidebarProgress, 500);
});

window.updateSidebarProgress = function() {
    const today = new Date();
    document.querySelectorAll('#registryList .patient-item').forEach(item => {
        const startStr = item.dataset.start;
        const regime = item.dataset.regime;
        const uid = item.dataset.uid;
        
        if(!startStr) return;
        
        const startDate = new Date(startStr);
        // Estimate total days based on regime
        let totalDays = 168; // 6 months default (IR/CR)
        if(regime === 'RR') totalDays = 240; // 8 months
        
        const diffTime = Math.abs(today - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        // Cap at 100%
        let pct = Math.min(100, Math.max(0, (diffDays / totalDays) * 100));
        
        // Update UI
        const bar = document.getElementById(`progress-${uid}`);
        const text = document.getElementById(`progress-text-${uid}`);
        
        if(bar) {
            bar.style.width = `${pct}%`;
            // Color based on completion
            if(pct < 25) bar.style.backgroundColor = '#3b82f6'; // Start
            else if(pct < 75) bar.style.backgroundColor = '#f59e0b'; // Middle
            else bar.style.backgroundColor = '#10b981'; // End
        }
        
        if(text) {
            // Months elapsed
            const months = (diffDays / 30).toFixed(1);
            text.innerText = `${months}m / ${(totalDays/30).toFixed(0)}m`;
        }
    });
}

window.loadTeams = loadTeams;
function loadTeams() {
    const listMy = document.getElementById('myTeamsList');
    const listPub = document.getElementById('publicTeamsList');
    const sortSelect = document.getElementById('teamSortSelect');
    const pagDiv = document.getElementById('teamPagination');
    const pagInfo = document.getElementById('teamPageInfo');
    
    if(listMy) listMy.innerHTML = '<div style="padding:10px; text-align:center;"><div class="spinner"></div></div>';
    if(listPub) listPub.innerHTML = '<div style="padding:10px; text-align:center;"><div class="spinner"></div></div>';
    
    const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
    const currentSlug = localStorage.getItem('tb_team_slug');
    const currentSort = sortSelect ? sortSelect.value : 'alphabet';
    const currentPage = window.currentPublicPage || 1;
    
    // 1. Fetch My Teams (Always full list for now)
    fetch('/api/teams/list?tab=my-team', {
        headers: { 'X-Device-ID': deviceId }
    })
    .then(res => {
        if(!res.ok) throw new Error("Failed to load your teams");
        return res.json();
    })
    .then(data => {
        if(!data.success || !listMy) return;
        if(data.teams.length === 0) {
            listMy.innerHTML = '<div style="color:#94a3b8; font-size:0.85rem; text-align:center; padding:10px; background:#f1f5f9; border-radius:6px;">You haven\'t joined any teams yet.</div>';
        } else {
            let html = '';
            data.teams.forEach(t => {
                const isActive = t.slug === currentSlug;
                let btn = '';
                if (isActive) {
                    btn = `<span style="font-size:0.75rem; font-weight:700; color:#166534; background:#dcfce7; padding:2px 8px; border-radius:12px;">ACTIVE</span>`;
                } else {
                    if(t.status === 'APPROVED' || t.status === undefined) { 
                        btn = `<button onclick="switchTeam('${t.slug}', '${t.name}', '${t.invite_code || ''}')" style="background:#0f172a; color:white; border:none; border-radius:6px; padding:4px 12px; cursor:pointer; font-size:0.75rem;">Switch</button>`;
                    } else {
                        btn = `<span style="color:#c2410c; background:#fff7ed; padding:2px 8px; border-radius:12px; font-size:0.75rem; border:1px solid #fdba74;">Pending</span>`;
                    }
                }
                const privacyBadge = t.is_public 
                    ? '<span style="font-size:0.65rem; background:#e0f2fe; color:#0284c7; padding:2px 6px; border-radius:10px; border:1px solid #bae6fd;">PUBLIC</span>' 
                    : '<span style="font-size:0.65rem; background:#f1f5f9; color:#64748b; padding:2px 6px; border-radius:10px; border:1px solid #cbd5e1;">PRIVATE</span>';
                
                html += `
                    <div style="background:white; border:1px solid ${isActive ? '#166534' : '#e2e8f0'}; padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span style="font-weight:700; color:#334155; font-size:0.9rem;">${t.name}</span>
                                ${privacyBadge}
                            </div>
                            <div style="font-size:0.75rem; color:#64748b; margin-top:2px; display:flex; align-items:center; gap:8px;">
                                <span>👥 ${t.member_count} members</span>
                                ${t.invite_code ? `
                                    <span style="color:#0369a1; background:#f0f9ff; padding:1px 6px; border-radius:4px; font-family:monospace; font-weight:700; border:1px dashed #0ea5e9; cursor:pointer;" onclick="event.stopPropagation(); navigator.clipboard.writeText('${t.invite_code}'); showToast('Code Copied!');" title="Click to copy">
                                      ${t.invite_code}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                        <div>${btn}</div>
                    </div>
                `;
            });
            listMy.innerHTML = html;
        }
    })
    .catch(err => {
        if(listMy) listMy.innerHTML = `<div style="color:#ef4444; font-size:0.8rem; text-align:center;">${err.message}</div>`;
    });

    // 2. Fetch Directory (Paginated & Sorted)
    fetch(`/api/teams/list?tab=directory&sort=${currentSort}&page=${currentPage}&limit=10`, {
        headers: { 'X-Device-ID': deviceId }
    })
    .then(res => {
        if(!res.ok) throw new Error("Failed to load directory");
        return res.json();
    })
    .then(data => {
        if(!data.success || !listPub) return;
        
        // Handle Empty State
        if(data.teams.length === 0) {
            listPub.innerHTML = '<div style="padding:20px; color:#94a3b8; text-align:center;">No public teams found.</div>';
            if(pagDiv) pagDiv.style.display = 'none';
        } else {
            let html = '';
            data.teams.forEach(t => {
                const privacyBadge = '<span style="font-size:0.65rem; background:#e0f2fe; color:#0284c7; padding:2px 6px; border-radius:10px; border:1px solid #bae6fd;">PUBLIC</span>';
                let btn = '';
                if (t.joined) {
                    btn = `<button disabled style="background:#f1f5f9; border:1px solid #e2e8f0; color:#94a3b8; border-radius:4px; padding:4px 10px; cursor:default; font-size:0.75rem;">Joined</button>`;
                } else {
                    btn = `<button onclick="joinTeam('${t.slug}')" style="background:white; border:1px solid #0f172a; color:#0f172a; border-radius:4px; padding:4px 10px; cursor:pointer; font-size:0.75rem;">Join</button>`;
                }

                html += `
                  <div class="team-list-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #f1f5f9;">
                      <div>
                          <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                            <div style="font-weight:600; color:#334155;">${t.name}</div>
                            ${privacyBadge}
                          </div>
                          <div style="font-size:0.75rem; color:#64748b;">👥 ${t.member_count} members</div>
                      </div>
                      <div>${btn}</div>
                  </div>
                `;
            });
            listPub.innerHTML = html;

            // Update Pagination UI
            if(pagDiv) {
                pagDiv.style.display = data.total_pages > 1 ? 'flex' : 'none';
                if(pagInfo) pagInfo.innerText = `Page ${data.current_page} / ${data.total_pages}`;
                
                // Disable/Enable buttons
                const prevBtn = document.getElementById('prevTeamPage');
                const nextBtn = document.getElementById('nextTeamPage');
                if(prevBtn) prevBtn.disabled = data.current_page <= 1;
                if(nextBtn) nextBtn.disabled = data.current_page >= data.total_pages;
                
                if(prevBtn) prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
                if(nextBtn) nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
            }
        }
    });
}

// window.switchTeam moved to end of file with other team logic

window.joinTeam = function(slug) {
    const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
    if(confirm("Request to join this team? Admin approval will be required.")) {
        fetch('/api/teams/join', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ slug: slug, user_name: deviceId, device_id: deviceId })
        })
        .then(res => {
            if(!res.ok) throw new Error("Join request failed");
            return res.json();
        })
        .then(data => {
            if(data.success) {
                if(data.status === 'APPROVED') {
                     showToast("Joined successfully!");
                     localStorage.setItem('tb_team_slug', slug);
                     updateMyTeamUI();
                } else {
                     showToast("Request Sent! Waiting for Admin Approval.");
                }
            } else {
                showToast(data.message || "Could not join team", "error");
            }
        })
        .catch(err => {
            showToast("Network Error: " + err.message, "error");
        });
    }
}

window.updateMyTeamUI = updateMyTeamUI;
function updateMyTeamUI() {
    const slug = localStorage.getItem('tb_team_slug');
    const name = localStorage.getItem('tb_team_name') || slug;
    
    const display = document.getElementById('myTeamDisplay');
    const desc = document.getElementById('myTeamDesc');
    const container = document.getElementById('teamActionsContainer');
    const badge = document.getElementById('teamBadge');
    
    if(slug) {
        if(display) display.innerText = name;
        if(desc) desc.innerText = "Active Workspace";
        if(badge) {
            badge.style.display = 'inline-block';
            badge.innerText = slug.slice(0,3).toUpperCase();
        }
        
        // Show Actions
        if(container) {
            container.innerHTML = `
                <div style="margin-top:1rem; padding-top:1rem; border-top:1px solid #e2e8f0; display:flex; justify-content:center; gap:8px;">
                     <button class="btn" style="background:white; border:1px solid #cbd5e1; color:#475569; font-size:0.85rem;" onclick="triggerLeaveFlow('${slug}')">Leave</button>
                     <button class="btn" style="background:#fee2e2; border:1px solid #fca5a5; color:#ef4444; font-size:0.85rem;" onclick="triggerDisbandFlow('${slug}')">Disband</button>
                </div>
            `;
            
             // Invite Code
            const code = localStorage.getItem('tb_team_invite_code');
            if(code) {
                container.innerHTML += `
                    <div style="margin-top:1rem; background:#f0f9ff; padding:8px; border-radius:6px; border:1px dashed #0ea5e9; color:#0369a1; font-size:0.9rem; display:flex; justify-content:space-between; align-items:center;">
                        <span>Invite Code: <strong style="font-family:monospace; font-size:1.2em;">${code}</strong></span>
                        <div style="display:flex; gap:5px;">
                            <button onclick="navigator.clipboard.writeText('${code}'); showToast('Code Copied!');" style="background:none; border:none; color:#0284c7; cursor:pointer;" title="Copy">📋</button>
                            <a href="mailto:?subject=Join my TB Calendar Team&body=Here is the invite code to join my team: ${code}" style="text-decoration:none; color:#0284c7; cursor:pointer; font-size:1.2em;" title="Email Invite">✉️</a>
                        </div>
                    </div>
                `;
            }
        }
        
        loadPendingMembers(slug);
        
    } else {
        // Guest Mode
        if(display) display.innerText = "Guest Mode";
        if(desc) desc.innerText = "Data is stored locally only.";
        if(container) container.innerHTML = '';
        if(badge) badge.style.display = 'none';
        
        // Hide Admin Sections
        const pSec = document.getElementById('adminPendingSection');
        const aSec = document.getElementById('adminActiveSection');
        if(pSec) pSec.style.display = 'none';
        if(aSec) aSec.style.display = 'none';
    }
}

window.joinTeamByCode = function() {
    const codeInput = document.getElementById('joinTeamCode');
    const code = codeInput.value.trim().toUpperCase();
    if(!code) return showToast("Please enter a code", "error");
    
    // Pattern validation (optional)
    // if(!/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code)) ...
    
    const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
    
    fetch('/api/teams/join', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ code: code, user_name: deviceId, device_id: deviceId })
    })
    .then(res => {
        if(!res.ok) throw new Error("Invalid code or server error");
        return res.json();
    })
    .then(data => {
        if(data.success) {
             showToast("Joined! " + (data.status === 'APPROVED' ? "Access Granted." : "Waiting for Approval."));
             
             localStorage.setItem('tb_team_slug', data.team_slug);
             localStorage.setItem('tb_team_name', data.team_name); // Backend returns team_name now
             // If we joined by code, we implicitly know the code!
             localStorage.setItem('tb_team_invite_code', code);
             
             updateMyTeamUI();
             loadTeams();
        } else {
            showToast(data.message || "Code check failed", "error");
        }
    })
    .catch(err => {
        showToast("Error: " + err.message, "error");
    });
}

window.loadPendingMembers = function(slug) {
    const containerPending = document.getElementById('pendingMembersList');
    const sectionPending = document.getElementById('adminPendingSection');
    
    const containerActive = document.getElementById('activeMembersList');
    const sectionActive = document.getElementById('adminActiveSection');
    
    if(!containerPending || !sectionPending) return;
    
    fetch(`/api/teams/members?slug=${slug}`)
    .then(res => {
        if(!res.ok) throw new Error("Could not load member list");
        return res.json();
    })
    .then(data => {
        if(data.success && data.members.length > 0) {
            const myDeviceId = localStorage.getItem('tb_device_name');

            // 1. Pending
            const pending = data.members.filter(m => m.status === 'PENDING');
            if(pending.length > 0) {
                sectionPending.style.display = 'block';
                let html = '';
                pending.forEach(m => {
                    html += `
                    <div style="background: white; border: 1px solid #bbf7d0; padding: 8px; border-radius: 6px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 0.85rem; font-weight: 600; color: #166534;">${m.user_name}</div>
                            <div style="font-size: 0.7rem; color: #64748b;">${m.device_id.substring(0,10)}...</div>
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <button onclick="actionMember(${m.id}, 'APPROVE')" style="background: #dcfce7; color: #166534; border: 1px solid #86efac; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 0.75rem; font-weight: 600;">✓</button>
                            <button onclick="actionMember(${m.id}, 'REJECT')" style="background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 0.75rem; font-weight: 600;">✗</button>
                        </div>
                    </div>`;
                });
                containerPending.innerHTML = html;
            } else {
                sectionPending.style.display = 'none';
            }

            // 2. Active
            const active = data.members.filter(m => m.status === 'APPROVED');
            if(active.length > 0 && containerActive && sectionActive) {
                sectionActive.style.display = 'block';
                let html = '';
                active.forEach(m => {
                    const isMe = m.device_id === myDeviceId;
                    const removeBtn = !isMe ? 
                        `<button onclick="if(confirm('Remove this user?')) actionMember(${m.id}, 'REJECT')" style="background: white; color: #ef4444; border: 1px solid #fca5a5; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 0.7rem;">Remove</button>` 
                        : `<span style="font-size:0.7rem; color:#15803d; font-weight:bold; background:#dcfce7; padding:2px 6px; border-radius:4px;">YOU</span>`;
                        
                    html += `
                    <div style="padding: 6px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 0.85rem; font-weight: 600; color: #334155;">${m.user_name}</div>
                            <div style="font-size: 0.7rem; color: #94a3b8;">${m.device_id.substring(0,8)}...</div>
                        </div>
                        <div>${removeBtn}</div>
                    </div>`;
                });
                containerActive.innerHTML = html;
            } else {
                 if(sectionActive) sectionActive.style.display = 'none';
            }

        } else {
            sectionPending.style.display = 'none';
            if(sectionActive) sectionActive.style.display = 'none';
        }
    })
    .catch(err => {
        console.error("Member load error", err);
        if(sectionPending) sectionPending.style.display = 'none';
        if(sectionActive) sectionActive.style.display = 'none';
    });
}

window.actionMember = function(id, action) {
    fetch('/api/teams/approve', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ member_id: id, action: action })
    })
    .then(res => {
        if(!res.ok) throw new Error("Action failed");
        return res.json();
    })
    .then(data => {
        if(data.success) {
            showToast(`Member ${action}D`); // APPROVED / REJECTED
            // Refresh
            const slug = localStorage.getItem('tb_team_slug');
            if(slug) loadPendingMembers(slug);
        } else {
            showToast(data.message || "Could not complete action", "error");
        }
    })
    .catch(err => {
        showToast("Error: " + err.message, "error");
    });
}

window.switchTeam = switchTeam;
function switchTeam(slug, name, inviteCode) {
    localStorage.setItem('tb_team_slug', slug);
    localStorage.setItem('tb_team_name', name);
    if(inviteCode) localStorage.setItem('tb_team_invite_code', inviteCode);
    else localStorage.removeItem('tb_team_invite_code'); // Clear if unknown
    
    showToast(`Switched to ${name}`);
    
    // HARD REFRESH for this new team
    window.allPatientData = [];
    window.lastSyncTime = null;
    
    updateMyTeamUI();
    loadTeams(); 
    if(window.refreshPatientDataAndUI) window.refreshPatientDataAndUI();
    
    // Save switch for offline
    if(window.persistLocalData) window.persistLocalData();
}

window.triggerLeaveFlow = function(slug) {
    if(confirm("Are you sure you want to leave this team?")) {
         const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
         fetch('/api/teams/leave', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'X-Device-ID': deviceId },
             body: JSON.stringify({ slug: slug })
         })
         .then(res => {
             if(!res.ok) throw new Error("Leave request failed");
             return res.json();
         })
         .then(data => {
             if(data.success) {
                 showToast("Left team successfully.");
                 
                 // Only clear active workspace if it's the team we just left
                 const currentSlug = localStorage.getItem('tb_team_slug');
                 if(currentSlug === slug) {
                     localStorage.removeItem('tb_team_slug');
                     localStorage.removeItem('tb_team_name');
                     localStorage.removeItem('tb_team_invite_code');
                     updateMyTeamUI();
                 }
                 
                 loadTeams();
                 // window.location.reload(); // Removed reload for smoother UI
             } else {
                 showToast(data.message || "Failed to leave", "error");
             }
         })
         .catch(err => {
             showToast("Error: " + err.message, "error");
         });
    }
}

window.triggerDisbandFlow = function(slug) {
    const modal = document.getElementById('disbandModal');
    const confirmBtn = document.getElementById('confirmDisbandBtn');
    
    // Show Loading state in stats
    document.getElementById('statPatients').innerText = '...';
    document.getElementById('statEvents').innerText = '...';
    document.getElementById('statMembers').innerText = '...';
    document.getElementById('statSize').innerText = '...';
    
    modal.style.display = 'flex';
    
    // Fetch Stats
    fetch('/api/teams/stats', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ slug: slug })
    })
    .then(res => {
        if(!res.ok) throw new Error("Could not retrieve stats");
        return res.json();
    })
    .then(data => {
        if(data.success) {
            document.getElementById('statPatients').innerText = data.stats.patients;
            document.getElementById('statEvents').innerText = data.stats.events;
            document.getElementById('statMembers').innerText = data.stats.members;
            document.getElementById('statSize').innerText = (data.stats.size_bytes / 1024).toFixed(2) + ' KB';
            
            confirmBtn.onclick = () => executeDisband(slug);
        } else {
            showToast("Failed to fetch stats: " + data.message, "error");
            modal.style.display = 'none';
        }
    })
    .catch(err => {
        showToast("Error: " + err.message, "error");
        modal.style.display = 'none';
    });
}

window.executeDisband = function(slug) {
    const btn = document.getElementById('confirmDisbandBtn');
    btn.innerHTML = 'Downloading... <span class="spinner"></span>';
    btn.disabled = true;
    
    const deviceId = localStorage.getItem('tb_device_name') || 'Guest';
    
    fetch('/api/teams/disband', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'X-Device-ID': deviceId
        },
        body: JSON.stringify({ slug: slug, device_id: deviceId })
    })
    .then(res => {
        if(!res.ok) throw new Error("Disband request failed");
        return res.json();
    })
    .then(res => {
        if(res.success) {
            // Trigger Download
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.backup, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `backup-${slug}-${new Date().toISOString()}.json`);
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            
            showToast("Team Disbanded & Backup Downloaded.");
            
            // Reset Local State only if disbanded team was active
            const currentSlug = localStorage.getItem('tb_team_slug');
            if(currentSlug === slug) {
                localStorage.removeItem('tb_team_slug');
                localStorage.removeItem('tb_team_name');
                localStorage.removeItem('tb_team_status');
                localStorage.removeItem('tb_team_invite_code');
            }
            
            setTimeout(() => {
                document.getElementById('disbandModal').style.display = 'none';
                updateMyTeamUI();
                loadTeams();
                if(window.refreshPatientDataAndUI) window.refreshPatientDataAndUI();
            }, 1000);
        } else {
            throw new Error(res.message);
        }
    })
    .catch(err => {
        console.error(err);
        showToast("Disband Failed: " + err.message, "error");
        btn.innerHTML = '💀 Confirm & Download';
        btn.disabled = false;
    });
}

// Initial check
document.addEventListener('DOMContentLoaded', () => { setTimeout(window.updateMyTeamUI, 500); });

// Tab Switching (Added in UI Redesign)
window.switchTeamTab = function(tab) {
    document.querySelectorAll('.team-tab-btn').forEach(b => {
        b.style.borderBottom = '2px solid transparent';
        b.style.color = '#64748b';
        b.classList.remove('active');
    });
    document.querySelectorAll(`[onclick="switchTeamTab('${tab}')"]`).forEach(b => {
        b.style.borderBottom = '2px solid #0f172a';
        b.style.color = '#0f172a';
        b.classList.add('active');
    });
    
    const tMy = document.getElementById('tab-my-team');
    const tDir = document.getElementById('tab-directory');
    
    if(tab === 'my-team') {
        if(tMy) tMy.style.display = 'block';
        if(tDir) tDir.style.display = 'none';
        loadTeams(); // Refresh to show active status
    } else {
        if(tMy) tMy.style.display = 'none';
        if(tDir) tDir.style.display = 'block';
        loadTeams(); // Ensure directory is loaded
    }
}