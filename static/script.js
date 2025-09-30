document.addEventListener('DOMContentLoaded', function() {
  // Initialize calendar
  var calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: 'dayGridMonth',
    events: '/events',
    eventClick: function(info) {
  const p = info.event.extendedProps.patient;
  const color = info.event.backgroundColor || '#1abc9c';
  const modal = document.getElementById('eventModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalDetails = document.getElementById('modalDetails');

  modalTitle.innerText = `${p.name}: ${info.event.title}`;
  modalTitle.style.backgroundColor = color;
  modalTitle.style.color = '#fff';
  modalTitle.style.padding = '10px';
  modalTitle.style.borderRadius = '8px 8px 0 0';

  const isMEnd = info.event.title.includes("M-end");
  let outcomeOptions = '';
  if (isMEnd) {
    outcomeOptions = `
      <option value="" ${!info.event.extendedProps.outcome ? 'selected' : ''}>Ongoing</option>
      <option value="Cured" ${info.event.extendedProps.outcome === 'Cured' ? 'selected' : ''}>Cured</option>
      <option value="Completed" ${info.event.extendedProps.outcome === 'Completed' ? 'selected' : ''}>Completed</option>
      <option value="Failed" ${info.event.extendedProps.outcome === 'Failed' ? 'selected' : ''}>Failed</option>
      <option value="LTFU" ${info.event.extendedProps.outcome === 'LTFU' ? 'selected' : ''}>LTFU</option>
      <option value="Died" ${info.event.extendedProps.outcome === 'Died' ? 'selected' : ''}>Died</option>
    `;
  } else {
    outcomeOptions = `
      <option value="" ${!info.event.extendedProps.outcome ? 'selected' : ''}>Ongoing</option>
      <option value="Failed" ${info.event.extendedProps.outcome === 'Failed' ? 'selected' : ''}>Failed</option>
      <option value="LTFU" ${info.event.extendedProps.outcome === 'LTFU' ? 'selected' : ''}>LTFU</option>
      <option value="Died" ${info.event.extendedProps.outcome === 'Died' ? 'selected' : ''}>Died</option>
    `;
  }

  const originalDate = new Date(info.event.startStr); // Use original calendar date
  modalDetails.innerHTML = `
    <strong>Age:</strong> ${p.age}<br>
    <strong>Sex:</strong> ${p.sex}<br>
    <strong>Address:</strong> ${p.address}<br>
    <strong>Regime:</strong> ${p.regime}<br>
    <strong>Missed Days:</strong> <input type="number" id="modalMissedDays" value="${info.event.extendedProps.missed_days || 0}" style="width:60px;"><br>
    <strong>Remark:</strong> <input type="text" id="modalRemark" value="${info.event.extendedProps.remark || ''}" style="width:100%;"><br>
    <strong>Outcome:</strong>
    <select id="modalOutcome">${outcomeOptions}</select><br>
    <strong>Date:</strong> <span id="modalDate">${info.event.startStr}</span><br>
    <strong>Color:</strong> <span style="color:${color}">${color}</span><br>
    <button id="saveEventBtn" style="margin-top:10px;">Save Changes</button>
  `;

  modal.style.borderTop = `5px solid ${color}`;
  modal.style.display = 'block';

  const missedInput = document.getElementById('modalMissedDays');
  const dateSpan = document.getElementById('modalDate');

  // Update displayed date instantly on missed days change
  missedInput.addEventListener('input', function() {
    const newMissed = parseInt(this.value || 0);
    const shiftedDate = new Date(originalDate);
    shiftedDate.setDate(shiftedDate.getDate() + newMissed);
    dateSpan.innerText = shiftedDate.toISOString().slice(0,10);
  });

  // Save button
  document.getElementById('saveEventBtn').onclick = function() {
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
        // alert('Event updated!');
        modal.style.display = 'none';
        calendar.refetchEvents(); // refresh calendar
      } else {
        alert('Failed to update event: ' + data.message);
      }
    })
    .catch(err => console.error(err));
  }
}
  });

  calendar.render();

  // Close modal
  document.getElementById('closeModal').onclick = function() {
    document.getElementById('eventModal').style.display = 'none';
  }

  window.onclick = function(event) {
    if (event.target == document.getElementById('eventModal')) {
      document.getElementById('eventModal').style.display = 'none';
    }
  }
});

// Collapsible Add Patient Form
const toggleBtn = document.getElementById('toggleFormBtn');
const patientForm = document.getElementById('patientForm');
toggleBtn.addEventListener('click', function() {
  patientForm.classList.toggle('show');
  toggleBtn.innerText = patientForm.classList.contains('show') ? "Add New Patient ▴" : "Add New Patient ▾";
});

// Milestones preview
const regimeMilestones = { "IR": ["M2", "M5", "M6/M-end"], "CR": ["M2", "M5", "M6/M-end"], "RR": ["M3", "M5", "M8/M-end"] };
const regimeSelect = document.getElementById("regime");
const milestonesPreview = document.getElementById("milestonesPreview");
function updateMilestones() {
  const milestones = regimeMilestones[regimeSelect.value] || ["M1"];
  milestonesPreview.innerText = milestones.join(" | ");
}
updateMilestones();
regimeSelect.addEventListener("change", updateMilestones);




document.querySelectorAll('.deletePatientBtn').forEach(btn => {
  btn.addEventListener('click', function() {
    const patientId = this.dataset.id;
    const confirmDel = confirm("Are you sure you want to delete this patient and all their events?");
    if (!confirmDel) return;

    fetch(`/delete_patient/${patientId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert("Patient deleted successfully.");
        location.reload(); // refresh page
      } else {
        alert("Failed: " + data.message);
      }
    })
    .catch(err => console.error(err));
  });
});