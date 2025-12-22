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
        btn.innerHTML = 'Adding... <span class="spinner"></span>'; // Spinner class needed in CSS
    });
  }

});