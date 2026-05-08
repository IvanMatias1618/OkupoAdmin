const API_URL = "http://localhost:3000";

interface Colaborador {
  id: number;
  usuario_id: number;
  telefono: string;
  estado_verificacion: string;
  ine_frontal: string | null;
  ine_trasera: string | null;
  comprobante_domicilio: string | null;
  foto_selfie_ine: string | null;
}

let colaboradoresPendientes: Colaborador[] = [];
let colaboradorSeleccionado: Colaborador | null = null;
let authToken: string | null = localStorage.getItem("auth_token");

// Elementos del DOM
const loginSection = document.getElementById("login-section")!;
const dashboardSection = document.getElementById("dashboard-section")!;
const loginForm = document.getElementById("login-form") as HTMLFormElement;
const loginError = document.getElementById("login-error")!;
const tablaColaboradores = document.getElementById("tabla-colaboradores")!;
const modalVerificacion = document.getElementById("modal-verificacion")!;
const closeButton = document.querySelector(".close-button")!;
const authStatus = document.getElementById("auth-status")!;
const btnLogout = document.getElementById("btn-logout")!;

// Navegación
const navLinks = document.querySelectorAll(".nav-link");
const contentSections = document.querySelectorAll(".content-section");

// SQL Console
const sqlInput = document.getElementById("sql-input") as HTMLTextAreaElement;
const btnRunSql = document.getElementById("btn-run-sql")!;
const btnClearSql = document.getElementById("btn-clear-sql")!;
const sqlResultsContainer = document.getElementById("sql-results-container")!;

// Imágenes del modal
const imgIneFrontal = document.getElementById("img-ine-frontal") as HTMLImageElement;
const imgIneTrasera = document.getElementById("img-ine-trasera") as HTMLImageElement;
const imgComprobante = document.getElementById("img-comprobante") as HTMLImageElement;
const imgSelfie = document.getElementById("img-selfie") as HTMLImageElement;

function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

async function login(event: Event) {
  event.preventDefault();
  const email = (document.getElementById("email") as HTMLInputElement).value;
  const password = (document.getElementById("password") as HTMLInputElement).value;

  loginError.classList.add("hidden");

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correo: email, contrasenna: password })
    });

    if (!response.ok) {
      throw new Error("Credenciales inválidas");
    }

    const token = await response.json();
    const payload = parseJwt(token);

    if (payload && payload.rol === "admin") {
      authToken = token;
      localStorage.setItem("auth_token", token);
      showDashboard();
    } else {
      throw new Error("No tienes permisos de administrador");
    }
  } catch (error: any) {
    loginError.textContent = error.message;
    loginError.classList.remove("hidden");
  }
}

function logout() {
  authToken = null;
  localStorage.removeItem("auth_token");
  showLogin();
}

function showLogin() {
  loginSection.classList.remove("hidden");
  dashboardSection.classList.add("hidden");
}

function showDashboard() {
  loginSection.classList.add("hidden");
  dashboardSection.classList.remove("hidden");
  switchSection("lista-pendientes");
}

function switchSection(sectionId: string) {
  contentSections.forEach(section => {
    section.classList.add("hidden");
  });
  document.getElementById(sectionId)?.classList.remove("hidden");

  navLinks.forEach(link => {
    link.classList.toggle("active", link.getAttribute("data-section") === sectionId);
  });

  if (sectionId === "lista-pendientes") {
    cargarPendientes();
  } else if (sectionId === "infrastructure-info") {
    cargarInfraestructura();
  }
}

async function cargarInfraestructura() {
  if (!authToken) return;
  const infraContainer = document.getElementById("infrastructure-results")!;
  infraContainer.innerHTML = "<div class='results-placeholder'>Cargando estructura...</div>";

  try {
    // Consulta para obtener todas las tablas y sus columnas en MySQL
    const sql = `
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = 'finit'
      ORDER BY TABLE_NAME, ORDINAL_POSITION;
    `;

    const response = await fetch(`${API_URL}/admin/query`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
      },
      body: JSON.stringify({ sql })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.Error || "Error al cargar");

    renderInfraestructura(data);
  } catch (error: any) {
    infraContainer.innerHTML = `<div style="color: #dc2626; padding: 1rem;">Error: ${error.message}</div>`;
  }
}

function renderInfraestructura(data: any[]) {
  const infraContainer = document.getElementById("infrastructure-results")!;
  if (!data.length) {
    infraContainer.innerHTML = "<div class='results-placeholder'>No se encontró información.</div>";
    return;
  }

  // Agrupar por tabla
  const tables: Record<string, any[]> = {};
  data.forEach(row => {
    if (!tables[row.TABLE_NAME]) tables[row.TABLE_NAME] = [];
    tables[row.TABLE_NAME].push(row);
  });

  let html = "";
  for (const tableName in tables) {
    html += `
      <div class="table-card">
        <h3>${tableName}</h3>
        <div class="column-list">
          ${tables[tableName].map(col => `
            <div class="column-item">
              <span class="column-name">${col.COLUMN_NAME}</span>
              <span class="column-type">${col.DATA_TYPE}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }
  infraContainer.innerHTML = html;
}

async function cargarPendientes() {
  if (!authToken) return;

  try {
    authStatus.textContent = "Cargando...";
    const response = await fetch(`${API_URL}/admin/colaboradores/pendientes`, {
      headers: { "Authorization": `Bearer ${authToken}` }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        authStatus.textContent = "🔴 Sesión expirada";
        logout();
      } else {
        authStatus.textContent = `🔴 Error: ${response.status}`;
      }
      return;
    }

    colaboradoresPendientes = await response.json();
    renderizarTabla();
    authStatus.textContent = "🟢 Conectado";
  } catch (error) {
    console.error("Error al cargar pendientes:", error);
    authStatus.textContent = "🔴 Error de conexión";
  }
}

function renderizarTabla() {
  if (colaboradoresPendientes.length === 0) {
    tablaColaboradores.innerHTML = "<p style='padding: 1rem;'>No hay colaboradores pendientes.</p>";
    return;
  }

  tablaColaboradores.innerHTML = colaboradoresPendientes.map(colab => `
    <div class="colaborador-card">
      <div class="colaborador-info">
        <h3>Colaborador #${colab.id}</h3>
        <p>Tel: ${colab.telefono} | Usuario ID: ${colab.usuario_id}</p>
      </div>
      <button class="btn-primary" onclick="window.verDetalle(${colab.id})">Ver Documentos</button>
    </div>
  `).join("");
}

(window as any).verDetalle = (id: number) => {
  colaboradorSeleccionado = colaboradoresPendientes.find(c => c.id === id) || null;
  if (!colaboradorSeleccionado) return;

  const fullUrl = (path: string | null) => path ? `${API_URL}${path}` : "https://via.placeholder.com/250?text=No+disponible";
  
  imgIneFrontal.src = fullUrl(colaboradorSeleccionado.ine_frontal);
  imgIneTrasera.src = fullUrl(colaboradorSeleccionado.ine_trasera);
  imgComprobante.src = fullUrl(colaboradorSeleccionado.comprobante_domicilio);
  imgSelfie.src = fullUrl(colaboradorSeleccionado.foto_selfie_ine);

  modalVerificacion.classList.remove("hidden");
};

async function procesarVerificacion(estado: "verificado" | "rechazado") {
  if (!colaboradorSeleccionado || !authToken) return;

  try {
    const response = await fetch(`${API_URL}/colaboradores/${colaboradorSeleccionado.id}/verificar`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
      },
      body: JSON.stringify({ 
        estado, 
        comentario: estado === "verificado" ? "Aprobado por administración" : "Documentación insuficiente" 
      })
    });

    if (response.ok) {
      modalVerificacion.classList.add("hidden");
      await cargarPendientes();
      alert(`Colaborador ${estado} con éxito.`);
    } else {
      alert("Error al procesar la verificación.");
    }
  } catch (error) {
    console.error("Error:", error);
    alert("Error de conexión al procesar.");
  }
}

async function runSqlQuery() {
  const sql = sqlInput.value.trim();
  if (!sql || !authToken) return;

  sqlResultsContainer.innerHTML = "<div class='results-placeholder'>Ejecutando consulta...</div>";

  try {
    const response = await fetch(`${API_URL}/admin/query`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
      },
      body: JSON.stringify({ sql })
    });

    const result = await response.json();

    if (!response.ok) {
      sqlResultsContainer.innerHTML = `<div style="color: #dc2626; padding: 1rem; background: #fee2e2; border-radius: 6px;">Error: ${result.Error || result.error || JSON.stringify(result)}</div>`;
      return;
    }

    renderSqlResults(result);
  } catch (error: any) {
    sqlResultsContainer.innerHTML = `<div style="color: #dc2626; padding: 1rem;">Error de conexión: ${error.message}</div>`;
  }
}

function renderSqlResults(data: any) {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      sqlResultsContainer.innerHTML = "<div class='results-placeholder'>Consulta ejecutada. 0 filas devueltas.</div>";
      return;
    }

    const columns = Object.keys(data[0]);
    let html = "<table class='sql-table'><thead><tr>";
    columns.forEach(col => html += `<th>${col}</th>`);
    html += "</tr></thead><tbody>";

    data.forEach(row => {
      html += "<tr>";
      columns.forEach(col => {
        const val = row[col];
        html += `<td>${val === null ? '<em style="color:#ccc">null</em>' : val}</td>`;
      });
      html += "</tr>";
    });

    html += "</tbody></table>";
    sqlResultsContainer.innerHTML = html;
  } else {
    // Es una operacion (Insert/Update/Delete)
    sqlResultsContainer.innerHTML = `
      <div style="padding: 1rem; background: #f0fdf4; color: #166534; border-radius: 6px;">
        <strong>Operación exitosa</strong><br>
        Filas afectadas: ${data.filas_afectadas}<br>
        Último ID: ${data.ultimo_id_insertado}
      </div>
    `;
  }
}

// Event Listeners
loginForm.addEventListener("submit", login);
btnLogout.addEventListener("click", logout);
closeButton.addEventListener("click", () => modalVerificacion.classList.add("hidden"));
document.getElementById("btn-aprobar")?.addEventListener("click", () => procesarVerificacion("verificado"));
document.getElementById("btn-rechazar")?.addEventListener("click", () => procesarVerificacion("rechazado"));

navLinks.forEach(link => {
  link.addEventListener("click", () => {
    const section = link.getAttribute("data-section");
    if (section) switchSection(section);
  });
});

btnRunSql.addEventListener("click", runSqlQuery);
btnClearSql.addEventListener("click", () => {
  sqlInput.value = "";
  sqlResultsContainer.innerHTML = "<div class='results-placeholder'>Los resultados aparecerán aquí...</div>";
});

window.addEventListener("DOMContentLoaded", () => {
  if (authToken) {
    const payload = parseJwt(authToken);
    if (payload && payload.rol === "admin" && payload.exp > Date.now() / 1000) {
      showDashboard();
    } else {
      logout();
    }
  } else {
    showLogin();
  }
});
