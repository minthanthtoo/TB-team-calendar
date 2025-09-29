document.addEventListener('DOMContentLoaded', function() {
  var calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: 'dayGridMonth',
    events: '/events',
    eventClick: function(info) {
      const p = info.event.extendedProps.patient;
      const color = info.event.backgroundColor || '#1abc9c';

      // Set modal title and color
      const modal = document.getElementById('eventModal');
      const modalTitle = document.getElementById('modalTitle');
      modalTitle.innerText = `${p.name}: ${info.event.title}`; // backticks
      modalTitle.style.backgroundColor = color;
      modalTitle.style.color = '#fff';
      modalTitle.style.padding = '10px';
      modalTitle.style.borderRadius = '8px 8px 0 0';

      // Modal details
      document.getElementById('modalDetails').innerHTML = `
        <strong>Age:</strong> ${p.age}<br>
        <strong>Sex:</strong> ${p.sex}<br>
        <strong>Address:</strong> ${p.address}<br>
        <strong>Regime:</strong> ${p.regime}<br>
        <strong>Remark:</strong> ${p.remark}<br>
        <strong>Date:</strong> ${info.event.start.toISOString().slice(0,10)}<br>
        <strong>Color:</strong> <span style="color:${color}">${color}</span>
      `;

      modal.style.borderTop = `5px solid ${color}`; // backticks
      modal.style.display = 'block';
    }
  });
  calendar.render();

  // Close modal
  document.getElementById('closeModal').onclick = function() {
    document.getElementById('eventModal').style.display = 'none';
  }

  // Close modal on outside click
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
  if (patientForm.classList.contains('show')) {
    toggleBtn.innerText = "Add New Patient ▴"; // collapse icon
  } else {
    toggleBtn.innerText = "Add New Patient ▾"; // expand icon
  }
});
