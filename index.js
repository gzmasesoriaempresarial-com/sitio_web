"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

function handleCORS(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

const sendMail = async (mailOptions) => {
  try {
    const cfg = functions.config();
    if (!cfg.email || !cfg.email.user) return;
    const t = nodemailer.createTransport({
      service: "gmail",
      auth: { user: cfg.email.user, pass: cfg.email.pass }
    });
    await t.sendMail({ ...mailOptions, from: `"GZM Web" <${cfg.email.user}>` });
  } catch (e) {
    console.warn("Email no enviado:", e.message);
  }
};

// ── 1. CONTACTO ──────────────────────────────────────────────
exports.onContactForm = functions.https.onRequest(async (req, res) => {
  if (handleCORS(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
  const { nombre, empresa, email, pais, servicio, mensaje } = req.body;
  if (!nombre || !email) { res.status(400).json({ error: "Nombre y email requeridos" }); return; }
  try {
    const ref = await db.collection("contactos").add({
      nombre, empresa: empresa || "", email, pais: pais || "",
      servicio: servicio || "", mensaje: mensaje || "",
      fecha: admin.firestore.FieldValue.serverTimestamp(),
      estado: "nuevo", origen: "formulario-web", asignado_a: ""
    });
    sendMail({
      to: "marco@gzmasesoriaempresarial.com",
      subject: `Nueva consulta — ${nombre}`,
      text: `Nombre: ${nombre}\nEmpresa: ${empresa || "-"}\nEmail: ${email}\nPaís: ${pais || "-"}\nServicio: ${servicio || "-"}\nMensaje: ${mensaje || "-"}\nID: ${ref.id}`
    });
    sendMail({
      to: email,
      subject: "Recibimos tu consulta — GZM Asesoría Empresarial",
      text: `Hola ${nombre},\n\nRecibimos tu consulta y te contactaremos en menos de 24 horas hábiles.\n\nWhatsApp: +591 763 58689\n\nGZM Asesoría Empresarial\nSanta Cruz de la Sierra, Bolivia`
    });
    res.status(200).json({ success: true, id: ref.id });
  } catch (e) {
    console.error("onContactForm error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 2. INSCRIPCIÓN ACADEMIA ───────────────────────────────────
exports.onInscripcionAcademia = functions.https.onRequest(async (req, res) => {
  if (handleCORS(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
  const { nombre_certificado, documento_identidad, direccion, email, telefono, curso } = req.body;
  if (!nombre_certificado || !documento_identidad || !direccion || !email || !telefono) {
    res.status(400).json({ error: "Todos los campos son requeridos" }); return;
  }
  try {
    const ref = await db.collection("inscripciones_academia").add({
      nombre_certificado, documento_identidad, direccion, email, telefono,
      curso: curso || "Lista de espera general", modalidad: "por definir",
      estado: "lista-espera", vendedor_id: "", cupon_aplicado: "", precio_final: 0,
      fecha: admin.firestore.FieldValue.serverTimestamp()
    });
    sendMail({
      to: "marco@gzmasesoriaempresarial.com",
      subject: `Nueva inscripción Academia — ${nombre_certificado}`,
      text: `Nombre: ${nombre_certificado}\nCI: ${documento_identidad}\nDirección: ${direccion}\nEmail: ${email}\nTeléfono: ${telefono}\nCurso: ${curso || "-"}\nID: ${ref.id}`
    });
    sendMail({
      to: email,
      subject: "¡Inscripción recibida! — Academia GZM",
      text: `Hola ${nombre_certificado},\n\nTu inscripción al curso "${curso || "Academia GZM"}" fue registrada exitosamente.\nTe contactaremos pronto con los detalles.\n\nWhatsApp: +591 763 58689\n\nGZM Asesoría Empresarial`
    });
    res.status(200).json({ success: true, id: ref.id });
  } catch (e) {
    console.error("onInscripcionAcademia error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 3. LEAD GRATUITO ─────────────────────────────────────────
exports.onLeadGratuito = functions.https.onRequest(async (req, res) => {
  if (handleCORS(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
  const { nombre, telefono, email, recurso, origen } = req.body;
  if (!nombre || !telefono || !email) { res.status(400).json({ error: "Nombre, teléfono y email requeridos" }); return; }
  try {
    const ref = await db.collection("leads_gratuitos").add({
      nombre, telefono, email,
      recurso_descargado: recurso || "recurso-general",
      origen: origen || "sitio-web",
      estado_lead: "nuevo", vendedor_asignado: "",
      fecha: admin.firestore.FieldValue.serverTimestamp()
    });
    sendMail({
      to: "marco@gzmasesoriaempresarial.com",
      subject: `Nuevo lead — ${nombre}`,
      text: `Nombre: ${nombre}\nTeléfono: ${telefono}\nEmail: ${email}\nRecurso: ${recurso || "-"}\nOrigen: ${origen || "sitio-web"}\nID: ${ref.id}`
    });
    res.status(200).json({ success: true, id: ref.id });
  } catch (e) {
    console.error("onLeadGratuito error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 4. VALIDAR CUPÓN ─────────────────────────────────────────
exports.validarCupon = functions.https.onRequest(async (req, res) => {
  if (handleCORS(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
  const { codigo, aplica_a } = req.body;
  if (!codigo) { res.status(400).json({ error: "Código requerido" }); return; }
  try {
    const snap = await db.collection("cupones")
      .where("codigo", "==", codigo.toUpperCase())
      .where("estado", "==", "activo").limit(1).get();
    if (snap.empty) { res.status(404).json({ error: "Cupón no válido o expirado" }); return; }
    const cupon = snap.docs[0].data();
    const id = snap.docs[0].id;
    if (cupon.fecha_vencimiento && cupon.fecha_vencimiento.toDate() < new Date()) {
      await db.collection("cupones").doc(id).update({ estado: "vencido" });
      res.status(400).json({ error: "Cupón vencido" }); return;
    }
    if (cupon.usos_maximos && cupon.usos_actuales >= cupon.usos_maximos) {
      res.status(400).json({ error: "Cupón agotado" }); return;
    }
    if (aplica_a && cupon.aplica_a !== "todo" && cupon.aplica_a !== aplica_a) {
      res.status(400).json({ error: "Cupón no aplica para este producto" }); return;
    }
    res.status(200).json({ success: true, tipo: cupon.tipo, valor: cupon.valor, descripcion: cupon.descripcion, id });
  } catch (e) {
    console.error("validarCupon error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 5. SUSCRIPCIÓN SAAS ──────────────────────────────────────
exports.onSuscripcion = functions.https.onRequest(async (req, res) => {
  if (handleCORS(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
  const { nombre, email, telefono, producto, plan, precio_original, cupon_id, precio_final } = req.body;
  if (!nombre || !email || !producto) { res.status(400).json({ error: "Nombre, email y producto requeridos" }); return; }
  try {
    if (cupon_id) await db.collection("cupones").doc(cupon_id).update({ usos_actuales: admin.firestore.FieldValue.increment(1) });
    const fv = new Date();
    fv.setMonth(fv.getMonth() + (plan === "anual" ? 12 : 1));
    const ref = await db.collection("suscripciones").add({
      nombre, email, telefono: telefono || "", producto, plan: plan || "mensual",
      precio_original: precio_original || 0, cupon_aplicado: cupon_id || "",
      precio_final: precio_final || precio_original || 0,
      estado: "pendiente", fecha_inicio: new Date(), fecha_vencimiento: fv,
      vendedor_id: "", comprobante_url: "",
      fecha: admin.firestore.FieldValue.serverTimestamp()
    });
    sendMail({
      to: "marco@gzmasesoriaempresarial.com",
      subject: `Nueva suscripción — ${producto} · ${nombre}`,
      text: `Cliente: ${nombre}\nEmail: ${email}\nProducto: ${producto}\nPlan: ${plan || "mensual"}\nMonto: Bs. ${precio_final || precio_original}\nID: ${ref.id}`
    });
    res.status(200).json({ success: true, id: ref.id });
  } catch (e) {
    console.error("onSuscripcion error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 6. VENTA HERRAMIENTA ─────────────────────────────────────
exports.onVentaHerramienta = functions.https.onRequest(async (req, res) => {
  if (handleCORS(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
  const { nombre, email, telefono, producto, precio_original, cupon_id, precio_final } = req.body;
  if (!nombre || !email || !producto) { res.status(400).json({ error: "Campos requeridos faltantes" }); return; }
  try {
    if (cupon_id) await db.collection("cupones").doc(cupon_id).update({ usos_actuales: admin.firestore.FieldValue.increment(1) });
    const ref = await db.collection("ventas_herramientas").add({
      nombre, email, telefono: telefono || "", producto,
      precio_original: precio_original || 0, cupon_aplicado: cupon_id || "",
      precio_final: precio_final || precio_original || 0,
      estado: "pendiente", vendedor_id: "", comprobante_url: "",
      fecha: admin.firestore.FieldValue.serverTimestamp()
    });
    sendMail({
      to: "marco@gzmasesoriaempresarial.com",
      subject: `Nueva venta herramienta — ${producto} · ${nombre}`,
      text: `Cliente: ${nombre}\nEmail: ${email}\nProducto: ${producto}\nMonto: Bs. ${precio_final || precio_original}\nID: ${ref.id}`
    });
    res.status(200).json({ success: true, id: ref.id });
  } catch (e) {
    console.error("onVentaHerramienta error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 7. CHAT IA CON GEMINI ────────────────────────────────────
exports.onChatMessage = functions.https.onRequest(async (req, res) => {
  if (handleCORS(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
  const { mensaje, sessionId } = req.body;
  if (!mensaje) { res.status(400).json({ error: "Mensaje requerido" }); return; }
  try {
    const { GoogleGenAI } = require("@google/genai");
    const ai = new GoogleGenAI({ apiKey: "AIzaSyDbzH-NFjnqHc4IBRJ82_KE82FCgJBKxgc" });
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: mensaje,
      config: {
        systemInstruction: `Eres el asistente virtual de GZM Asesoría Empresarial, empresa de consultoría liderada por el Mgs. Ing. Marco Antonio Guzmán Murillo en Santa Cruz de la Sierra, Bolivia. Servicios: Auditoría Financiera, Consultoría Estratégica, Gobierno Corporativo, Gestión de Proyectos PMI, Análisis Financiero, Gestión de Riesgos, Organización Empresarial, Gestión de Almacenes. Academia GZM (cursos próximos: Excel Financiero Avanzado Bs.350, Business Intelligence Power BI, Finanzas para Empresarios, Gestión de Proyectos PMI). Herramientas Excel: Sistema Contable Bs.350, Plantillas Financieras Bs.250, Evaluación OKR Bs.200. Software SaaS: Clínicas y Hospitales Bs.490/mes, Veterinarias Bs.350/mes, Gimnasios y CrossFit Bs.320/mes. Responde siempre en español, tono profesional y cálido, máximo 3 oraciones. Para agendar cita: WhatsApp +591 763 58689 o formulario de contacto en el sitio.`
      }
    });
    const respuesta = result.text;
    const sid = sessionId || "session_" + Date.now();
    try {
      await db.collection("chats").doc(sid).set({
        sessionId: sid,
        mensajes: admin.firestore.FieldValue.arrayUnion(
          { rol: "user", contenido: mensaje, fecha: new Date().toISOString() },
          { rol: "assistant", contenido: respuesta, fecha: new Date().toISOString() }
        ),
        fecha_inicio: admin.firestore.FieldValue.serverTimestamp(),
        email_capturado: "", convertido: false
      }, { merge: true });
    } catch (fsError) {
      console.error("Error guardando chat en Firestore:", fsError.message);
    }
    res.status(200).json({ success: true, respuesta, sessionId: sid });
  } catch (e) {
    console.error("onChatMessage error:", e.message, e.stack);
    res.status(500).json({ error: "Error procesando mensaje: " + e.message });
  }
});
