document.addEventListener('DOMContentLoaded', function() {
  
  // -- Toast Notification System --
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : '⚠'}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // -- Network Status --
  function updateNetworkStatus() {
    const statusEl = document.getElementById('networkStatus');
    if (!statusEl) return;
    
    if (navigator.onLine) {
        statusEl.innerHTML = '<span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span> Online';
        statusEl.style.background = '#d1fae5';
        statusEl.style.color = '#059669';
    } else {
        statusEl.innerHTML = '<span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></span> Offline';
        statusEl.style.background = '#fee2e2';
        statusEl.style.color = '#b91c1c';
        showToast("You are offline. Changes may not save.", "error");
    }
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus(); // Initial check

  // -- Mobile Responsive View --
  const isMobile = window.innerWidth < 768;
  const initialViewType = isMobile ? 'listMonth' : 'dayGridMonth';

  // Initialize Calendar
  var calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: initialViewType,
    headerToolbar: {
      left: isMobile ? 'prev,next' : 'prev,next today',
      center: 'title',
      right: isMobile ? 'listMonth,dayGridMonth' : 'dayGridMonth,listMonth'
    },
    titleFormat: { year: 'numeric', month: isMobile ? 'short' : 'long' },
    height: 'auto', // Adjust height automatically
    themeSystem: 'standard', // we use our own CSS overrides
    events: '/events',
    windowResize: function(view) {
      if (window.innerWidth < 768) {
        calendar.changeView('listMonth');
      } else {
        calendar.changeView('dayGridMonth');
      }
    },
    eventClick: function(info) {
      const p = info.event.extendedProps.patient;
      const color = info.event.backgroundColor || 'var(--primary)';
      const modal = document.getElementById('eventModal');
      const modalTitle = document.getElementById('modalTitle');
      const modalDetails = document.getElementById('modalDetails');
      const modalHeader = modal.querySelector('.modal-header');

      modalTitle.innerText = `${p.name} - ${info.event.title}`;
      modalHeader.style.backgroundColor = color; // Header matches event color

      const isMEnd = info.event.title.includes("M-end");
      
      // Outcome Options
      const outcomes = isMEnd 
        ? ["", "Cured", "Completed", "Failed", "LTFU", "Died"] 
        : ["", "Failed", "LTFU", "Died"];
        
      let outcomeOptions = outcomes.map(opt => {
         const label = opt === "" ? "Ongoing" : opt;
         const selected = info.event.extendedProps.outcome === opt ? 'selected' : '';
         return `<option value="${opt}" ${selected}>${label}</option>`;
      }).join('');

      const originalDate = new Date(info.event.startStr);

      modalDetails.innerHTML = `
        <div style="background: #f8fafc; padding: 1rem; border-bottom: 1px solid #e2e8f0; margin: -1.5rem -1.5rem 1.5rem -1.5rem;">
           <div class="detail-row" style="margin:0; border:none; padding:0;">
             <div style="flex:1">
               <div style="font-size:0.75rem; text-transform:uppercase; color:#64748b; font-weight:700;">Patient</div>
               <div style="font-size:1.1rem; font-weight:600; color:#0f172a;">${p.name}</div>
             </div>
             <div style="text-align:right">
               <div style="font-size:0.75rem; text-transform:uppercase; color:#64748b; font-weight:700;">Regime</div>
               <div style="font-size:1.1rem; font-weight:600; color:#0f172a;">${p.regime}</div>
             </div>
           </div>
           <div style="margin-top:0.5rem; font-size:0.85rem; color:#475569;">
             ${p.age} years • ${p.sex} • ${p.address || 'No Address'}
           </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
            <div class="form-group">
               <label>Expected Date</label>
               <div style="font-size:1.1rem; font-weight:600; color:#0f172a;">${info.event.startStr}</div>
            </div>
            <div class="form-group">
               <label>Calculated Date</label>
               <div id="modalDate" style="font-size:1.1rem; font-weight:600; color:${color};">${info.event.startStr}</div>
            </div>
        </div>

        <div class="form-group" style="margin-bottom: 1.5rem;">
           <label>Missed Treatment Days (Ripple Effect)</label>
           <div style="display:flex; align-items:center;">
             <input type="number" id="modalMissedDays" value="${info.event.extendedProps.missed_days || 0}" style="font-size:1.2rem; font-weight:600; width:100px; margin-right:1rem;">
             <span style="font-size:0.85rem; color:#64748b;">days delayed</span>
           </div>
           <div style="font-size:0.8rem; color:#ef4444; margin-top:0.25rem;">⚠ Changing this will shift all future events.</div>
        </div>

        <div class="form-group" style="margin-bottom: 1.5rem;">
           <label>Milestone Outcome</label>
           <select id="modalOutcome" style="padding:0.75rem; font-size:1rem;">${outcomeOptions}</select>
        </div>

        <div class="form-group">
           <label>Medical Notes</label>
           <textarea id="modalRemark" rows="3" style="width: 100%; resize: vertical; padding:0.75rem; font-size:0.95rem; border-color:#cbd5e1;" placeholder="Add clinical observations...">${info.event.extendedProps.remark || ''}</textarea>
        </div>

        <div style="margin-top: 2rem; display: flex; justify-content: flex-end; gap: 1rem;">
           <button id="closeModalBtnSecondary" class="btn btn-secondary" style="border:none;">Cancel</button>
           <button id="saveEventBtn" class="btn" style="min-width: 120px; background-color: ${color}">Save Record</button>
        </div>
      `;

      // Show Modal
      modal.style.display = 'block';

      // Logic for Modal Interactions
      const missedInput = document.getElementById('modalMissedDays');
      const dateSpan = document.getElementById('modalDate');
      const closeSecBtn = document.getElementById('closeModalBtnSecondary');
      
      if(closeSecBtn) closeSecBtn.onclick = () => { modal.style.display = 'none'; };

      // Update date dynamically
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
            id: info.event.id,
            missed_days: missedDays,
            remark: remark,
            outcome: outcome
          })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            showToast('Event updated successfully!', 'success');
            modal.style.display = 'none';
            calendar.refetchEvents(); 
          } else {
            showToast('Failed to update event: ' + data.message, 'error');
            btn.disabled = false;
            btn.innerText = "Save Changes";
          }
        })
        .catch(err => {
          console.error(err);
          showToast('Network error occurred', 'error');
          btn.disabled = false;
        });
      }
    }
  });

  calendar.render();

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
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast("Patient removed successfully");
                
                // 1. Remove from List UI
                const li = document.querySelector(`.deletePatientBtn[data-id="${patientIdToDelete}"]`).closest('li');
                if (li) {
                    li.style.transition = 'all 0.3s ease';
                    li.style.opacity = '0';
                    li.style.transform = 'translateX(20px)';
                    setTimeout(() => {
                        li.remove();
                        // Handle empty state
                        const list = document.querySelector('#legend ul');
                        if (list && list.children.length === 0) {
                           list.innerHTML = '<div style="text-align: center; padding: 2rem; color: #475569;"><div style="font-size: 2rem; margin-bottom: 0.5rem;">📭</div>No patients currently enrolled.</div>';
                        }
                    }, 300);
                }

                // 2. Update Counts
                const ids = ['headerCount', 'totalCount', 'activeCount'];
                ids.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        let val = parseInt(el.innerText || '0');
                        el.innerText = Math.max(0, val - 1); // Prevent negative
                    }
                });

                // 3. Refresh Calendar
                calendar.refetchEvents();

            } else {
                showToast("Error: " + data.message, 'error');
                btn.innerText = originalText;
                btn.disabled = false;
            }
        })
        .catch(err => {
            showToast("Network error", 'error');
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
  
  window.selectedDevice = null;

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
          if(data.devices.length === 0) {
              listDiv.innerHTML = '<span style="font-style:italic;">No active connections yet.</span>';
              return;
          }
          
          let html = '<ul style="list-style:none; padding:0; margin:0;">';
          data.devices.forEach(d => {
               // Styling for selection
               const isActive = window.selectedDevice === d.name;
               const bg = isActive ? '#e0f2fe' : 'transparent';
               const border = isActive ? '#0284c7' : 'transparent';
               const pendingBadge = d.has_pending ? '<span style="width:8px; height:8px; background:#ef4444; border-radius:50%; display:inline-block; margin-left:5px;"></span>' : '';
              
              html += `
                <li onclick="selectDevice('${d.name}')" style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:6px 8px; cursor:pointer; background:${bg}; border-left:3px solid ${border}; transition: background 0.2s;">
                    <span>
                        <span style="font-weight:600; color:#334155;">${d.name}</span>
                        ${pendingBadge} 
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
        if (!url.startsWith('http')) url = 'http://' + url;
        
        // Auto-add port 5000 if simplified IP is used and no port specified
        // Logic: if it ends with a digit and doesn't have a colon in the last 6 chars
        const chk = url.split('://')[1] || url;
        if (!chk.includes(':')) {
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

  // fetchFromHost remains same...

  window.pushToHost = function() {
          const host = window.getHostUrl();
          const statusDiv = document.getElementById('connectionStatus');
          const myName = document.getElementById('myDeviceName').value || "Guest Device";
          
          if (!host) { showToast("Please enter Host IP", "error"); return; }
          
          statusDiv.style.display = 'block';
          statusDiv.innerHTML = '<span class="spinner"></span> Packaging local data...';
          
          fetch('/api/get_all_data')
          .then(res => res.json())
          .then(local => {
              statusDiv.innerHTML = `Sending ${local.data.length} records to Host (${host})...`;
              return fetch(`${host}/api/stage_incoming`, {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({ 
                      data: local.data, 
                      deleted: local.deleted,
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

  window.acceptSelected = function() {
          if(!window.selectedDevice) { showToast("No device selected", "error"); return; }
          
          const checks = document.querySelectorAll('.sync-check:checked');
          const indices = Array.from(checks).map(c => parseInt(c.value));
          
          fetch('/api/commit_staged', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ 
                  indices: indices,
                  device: window.selectedDevice
              })
          })
          .then(res => res.json())
          .then(data => {
               if(data.success) {
                  showToast(`Merged ${data.count} records!`);
                  // Refresh the view - should now be empty or updated
                  checkIncoming(window.selectedDevice);
                  // Optional: prompt reload if needed
                  setTimeout(() => location.reload(), 1500);
               } else {
                   showToast("Error: " + data.message, "error");
               }
          })
  }

});