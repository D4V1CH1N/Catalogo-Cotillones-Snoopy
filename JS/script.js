// ==========================================
// Semana 3 - Configuracion de Cobro del Negocio
// ==========================================
const CONFIG_PAGO_NEGOCIO = {
    tienda: 'Cotillones Snoopy',
    whatsapp: '59172015082',
    qrUrl: '', // Si esta vacio, renderiza un codigo QR SVG limpio de demostracion; si tiene URL de Dropbox (raw=1), muestra esa imagen
    banco: 'Banco Union S.A.',
    cuenta: '10000045892314',
    titular: 'Cotillones Snoopy - Ventas',
    documento: 'NIT / CI: 8492015012'
};

// ==========================================
// BLOQUE 1 - Conexion API, Roles y Cola Offline FIFO
// ==========================================
// Semana 3 - Backend Supabase
(function (global) {
    const SUPABASE_URL = 'https://bmcdlimkoxnlyqeyksdk.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_ci-J9b7yQEoYOqxbm3IDMA_DrOTWRr-';
    const PROYECTO_ACTUAL = 'catalogo_snoopy';
    const CLAVE_SESION_LEGADA = 'sesionActiva_' + PROYECTO_ACTUAL;
    const CLAVE_SESION = 'sesionReal_' + PROYECTO_ACTUAL;
    const CLAVE_COLA_FIFO = 'colaSincronizacion_' + PROYECTO_ACTUAL;
    const CLAVE_CACHE_EXTRAS = 'cacheProductosExtra_' + PROYECTO_ACTUAL;
    const CLAVE_CACHE_PROMO = 'cachePromocion_' + PROYECTO_ACTUAL;
    const CLAVE_MIS_PEDIDOS_IDS = 'misPedidosIds_' + PROYECTO_ACTUAL;

    function limpiarSesionLegada() {
        try {
            sessionStorage.removeItem(CLAVE_SESION_LEGADA);
        } catch (err) {
        }
    }
    limpiarSesionLegada();

    function obtenerCabeceras(extra) {
        return Object.assign(
            {
                apikey: SUPABASE_KEY,
                Authorization: 'Bearer ' + SUPABASE_KEY,
                'Content-Type': 'application/json'
            },
            extra || {}
        );
    }

    function normalizarRol(rol) {
        const valor = String(rol || '').trim().toLowerCase();
        if (valor === 'admin' || valor === 'encargado' || valor === 'cliente') {
            return valor;
        }
        return 'cliente';
    }

    function obtenerSesion() {
        limpiarSesionLegada();
        try {
            const raw = sessionStorage.getItem(CLAVE_SESION);
            if (!raw) {
                return { usuario: 'Invitado', rol: 'cliente', autenticada: false };
            }
            const parsed = JSON.parse(raw);
            const usuarioLimpio = String((parsed && parsed.usuario) || '').trim();
            const autenticadaReal = Boolean(parsed && parsed.autenticada === true && usuarioLimpio && usuarioLimpio !== 'Invitado');
            if (!autenticadaReal) {
                sessionStorage.removeItem(CLAVE_SESION);
                return { usuario: 'Invitado', rol: 'cliente', autenticada: false };
            }
            return {
                usuario: usuarioLimpio,
                rol: normalizarRol(parsed.rol),
                autenticada: true
            };
        } catch (err) {
            return { usuario: 'Invitado', rol: 'cliente', autenticada: false };
        }
    }

    function guardarSesion(sesion) {
        const usuarioLimpio = String((sesion && sesion.usuario) || '').trim();
        const autenticadaReal = Boolean(sesion && sesion.autenticada === true && usuarioLimpio && usuarioLimpio !== 'Invitado');
        if (!autenticadaReal) {
            return cerrarSesion();
        }
        const limpia = {
            usuario: usuarioLimpio,
            rol: normalizarRol(sesion && sesion.rol),
            autenticada: true
        };
        try {
            sessionStorage.setItem(CLAVE_SESION, JSON.stringify(limpia));
        } catch (err) {
        }
        return limpia;
    }

    function cerrarSesion() {
        try {
            sessionStorage.removeItem(CLAVE_SESION_LEGADA);
            sessionStorage.removeItem(CLAVE_SESION);
            sessionStorage.removeItem(CLAVE_MIS_PEDIDOS_IDS);
        } catch (err) {
        }
        return { usuario: 'Invitado', rol: 'cliente', autenticada: false };
    }

    function obtenerIdsPedidosSesion() {
        try {
            const raw = sessionStorage.getItem(CLAVE_MIS_PEDIDOS_IDS);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr.map(String) : [];
        } catch (err) {
            return [];
        }
    }

    function registrarIdPedidoSesion(idPedido) {
        if (idPedido === undefined || idPedido === null || idPedido === '') return;
        const ids = obtenerIdsPedidosSesion();
        const clave = String(idPedido);
        if (ids.indexOf(clave) === -1) {
            ids.push(clave);
            try {
                sessionStorage.setItem(CLAVE_MIS_PEDIDOS_IDS, JSON.stringify(ids));
            } catch (err) {
            }
        }
    }

    // Semana 2 - Arquitectura PWA Offline
    function obtenerColaFIFO() {
        try {
            const raw = localStorage.getItem(CLAVE_COLA_FIFO);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            return [];
        }
    }

    function guardarColaFIFO(cola) {
        try {
            localStorage.setItem(CLAVE_COLA_FIFO, JSON.stringify(Array.isArray(cola) ? cola : []));
        } catch (err) {
        }
    }

    function encolarOperacionFIFO(tabla, metodo, cuerpo, filtroQuery) {
        const cola = obtenerColaFIFO();
        const entrada = {
            idCola: 'FIFO-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            tabla: tabla,
            metodo: metodo || 'POST',
            filtroQuery: filtroQuery || '',
            cuerpo: Object.assign({}, cuerpo, { proyecto: PROYECTO_ACTUAL }),
            registradaEn: new Date().toISOString()
        };
        cola.push(entrada);
        guardarColaFIFO(cola);
        return { ok: false, encolado: true, posicion: cola.length, entrada: entrada };
    }

    async function peticionRest(ruta, opciones) {
        const url = SUPABASE_URL + '/rest/v1/' + ruta;
        const resp = await fetch(url, opciones);
        if (!resp.ok) {
            const textoErr = await resp.text().catch(() => '');
            throw new Error('HTTP ' + resp.status + (textoErr ? ': ' + textoErr : ''));
        }
        if (resp.status === 204) {
            return [];
        }
        const texto = await resp.text();
        return texto ? JSON.parse(texto) : [];
    }

    async function sincronizarColaFifo() {
        if (!navigator.onLine) {
            return { procesados: 0, pendientes: obtenerColaFIFO().length, detenido: true };
        }
        const cola = obtenerColaFIFO();
        let procesados = 0;
        while (cola.length > 0) {
            const siguiente = cola[0];
            try {
                const ruta = siguiente.tabla + (siguiente.filtroQuery ? '?' + siguiente.filtroQuery : '');
                const filas = await peticionRest(ruta, {
                    method: siguiente.metodo || 'POST',
                    headers: obtenerCabeceras({ Prefer: 'return=representation' }),
                    body: JSON.stringify(siguiente.cuerpo)
                });
                if (siguiente.tabla === 'pedidos' && Array.isArray(filas) && filas[0] && filas[0].id) {
                    registrarIdPedidoSesion(filas[0].id);
                }
                cola.shift();
                guardarColaFIFO(cola);
                procesados += 1;
            } catch (err) {
                break;
            }
        }
        return { procesados: procesados, pendientes: cola.length, detenido: cola.length > 0 };
    }

    async function listarTabla(tabla, ordenDesc, limite) {
        const params = ['proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL), 'select=*'];
        if (ordenDesc !== false) {
            params.push('order=id.desc');
        }
        if (limite) {
            params.push('limit=' + Number(limite));
        }
        return peticionRest(tabla + '?' + params.join('&'), {
            method: 'GET',
            headers: obtenerCabeceras()
        });
    }

    async function listarProductosExtraConCache() {
        try {
            const filas = await listarTabla('productos_extra', true, 100);
            const lista = Array.isArray(filas) ? filas : [];
            try {
                localStorage.setItem(CLAVE_CACHE_EXTRAS, JSON.stringify(lista));
            } catch (err) {
            }
            return lista;
        } catch (err) {
            try {
                const raw = localStorage.getItem(CLAVE_CACHE_EXTRAS);
                const cached = raw ? JSON.parse(raw) : [];
                return Array.isArray(cached) ? cached : [];
            } catch (err2) {
                return [];
            }
        }
    }

    async function insertarRegistro(tabla, datos) {
        const payload = Object.assign({}, datos, { proyecto: PROYECTO_ACTUAL });
        if (!navigator.onLine) {
            return encolarOperacionFIFO(tabla, 'POST', payload);
        }
        try {
            const filas = await peticionRest(tabla, {
                method: 'POST',
                headers: obtenerCabeceras({ Prefer: 'return=representation' }),
                body: JSON.stringify(payload)
            });
            if (tabla === 'pedidos' && Array.isArray(filas) && filas[0] && filas[0].id) {
                registrarIdPedidoSesion(filas[0].id);
            }
            return { ok: true, encolado: false, data: filas };
        } catch (err) {
            return encolarOperacionFIFO(tabla, 'POST', payload);
        }
    }

    async function actualizarPorId(tabla, id, campos) {
        const filtro = 'id=eq.' + encodeURIComponent(String(id)) + '&proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL);
        if (!navigator.onLine) {
            return encolarOperacionFIFO(tabla, 'PATCH', campos, filtro);
        }
        try {
            const filas = await peticionRest(tabla + '?' + filtro, {
                method: 'PATCH',
                headers: obtenerCabeceras({ Prefer: 'return=representation' }),
                body: JSON.stringify(campos)
            });
            return { ok: true, encolado: false, data: filas };
        } catch (err) {
            return encolarOperacionFIFO(tabla, 'PATCH', campos, filtro);
        }
    }

    async function eliminarPorId(tabla, id) {
        const filtro = 'id=eq.' + encodeURIComponent(String(id)) + '&proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL);
        return peticionRest(tabla + '?' + filtro, {
            method: 'DELETE',
            headers: obtenerCabeceras({ Prefer: 'return=representation' })
        });
    }

    async function iniciarSesionCuenta(usuario, clave) {
        const u = String(usuario || '').trim();
        const c = String(clave || '').trim();
        if (!u || !c) {
            return { ok: false, error: 'Ingresa tu usuario y clave.' };
        }
        try {
            const q = 'cuentas?proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL) +
                '&usuario=eq.' + encodeURIComponent(u) +
                '&clave=eq.' + encodeURIComponent(c) + '&select=*&limit=1';
            const filas = await peticionRest(q, {
                method: 'GET',
                headers: obtenerCabeceras()
            });
            if (Array.isArray(filas) && filas.length > 0) {
                const cuenta = filas[0];
                return { ok: true, cuenta: { usuario: cuenta.usuario, rol: normalizarRol(cuenta.rol), autenticada: true } };
            }
            return { ok: false, error: 'Usuario o clave incorrectos.' };
        } catch (err) {
            return { ok: false, error: 'Sin conexion para validar credenciales.' };
        }
    }

    async function registrarCuenta(usuario, clave, rolSolicitado) {
        const payload = {
            proyecto: PROYECTO_ACTUAL,
            usuario: String(usuario || '').trim(),
            clave: String(clave || '').trim(),
            rol: normalizarRol(rolSolicitado)
        };
        try {
            const filas = await peticionRest('cuentas', {
                method: 'POST',
                headers: obtenerCabeceras({ Prefer: 'return=representation' }),
                body: JSON.stringify(payload)
            });
            return { ok: true, data: filas };
        } catch (err) {
            const msg = String(err && err.message || '');
            const duplicado = msg.indexOf('409') !== -1 || msg.toLowerCase().indexOf('duplicate') !== -1;
            return { ok: false, error: duplicado ? 'Ese nombre de usuario ya esta registrado. Elija otro.' : 'No se pudo completar el registro en este momento.' };
        }
    }

    function obtenerCachePromocion() {
        try {
            const raw = localStorage.getItem(CLAVE_CACHE_PROMO);
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            return null;
        }
    }

    function guardarCachePromocion(promo) {
        if (!promo) return;
        try {
            localStorage.setItem(CLAVE_CACHE_PROMO, JSON.stringify(promo));
        } catch (err) {
        }
    }

    async function obtenerPromocionActiva() {
        try {
            const q = 'promociones?proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL) + '&limit=1';
            const filas = await peticionRest(q, {
                method: 'GET',
                headers: obtenerCabeceras()
            });
            const promo = Array.isArray(filas) && filas.length > 0 ? filas[0] : null;
            if (promo) {
                guardarCachePromocion(promo);
                return { ok: true, vacia: false, promo: promo };
            }
            return { ok: true, vacia: true, promo: null };
        } catch (err) {
            return { ok: false, vacia: false, promo: obtenerCachePromocion(), offline: true, error: err.message };
        }
    }

    async function guardarPromocion(datosPromo) {
        const duracion = Math.max(1, parseInt(datosPromo.duracion_minutos, 10) || 15);
        const ahoraIso = new Date().toISOString();
        const expiraIso = datosPromo.expira_en
            ? new Date(datosPromo.expira_en).toISOString()
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        const payloadPatch = {
            titulo: String(datosPromo.titulo || '').trim(),
            descripcion: String(datosPromo.descripcion || '').trim(),
            precio: Number(datosPromo.precio || 25),
            duracion_minutos: duracion,
            expira_en: expiraIso,
            activa: datosPromo.activa !== false,
            actualizada_por: String(datosPromo.actualizada_por || 'administracion'),
            actualizada_en: ahoraIso
        };
        const filtro = 'proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL);
        try {
            const filasPatch = await peticionRest('promociones?' + filtro, {
                method: 'PATCH',
                headers: obtenerCabeceras({ Prefer: 'return=representation' }),
                body: JSON.stringify(payloadPatch)
            });
            if (Array.isArray(filasPatch) && filasPatch.length > 0) {
                guardarCachePromocion(filasPatch[0]);
                return { ok: true, metodo: 'PATCH', data: filasPatch[0] };
            }
            const payloadPost = Object.assign({ proyecto: PROYECTO_ACTUAL }, payloadPatch);
            const filasPost = await peticionRest('promociones', {
                method: 'POST',
                headers: obtenerCabeceras({ Prefer: 'return=representation' }),
                body: JSON.stringify(payloadPost)
            });
            const guardada = (Array.isArray(filasPost) && filasPost.length > 0) ? filasPost[0] : payloadPost;
            guardarCachePromocion(guardada);
            return { ok: true, metodo: 'POST', data: guardada };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    async function registrarActividad(cliente, accion, detalle) {
        return insertarRegistro('actividad_clientes', {
            cliente: String(cliente || 'Invitado'),
            accion: String(accion || 'ACCION'),
            detalle: String(detalle || '')
        });
    }

    async function purgarActividadProyecto() {
        const filtro = 'proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL);
        return peticionRest('actividad_clientes?' + filtro, {
            method: 'DELETE',
            headers: obtenerCabeceras({ Prefer: 'return=representation' })
        });
    }

    global.SupabaseAPI = {
        SUPABASE_URL: SUPABASE_URL,
        SUPABASE_KEY: SUPABASE_KEY,
        PROYECTO_ACTUAL: PROYECTO_ACTUAL,
        CLAVE_SESION: CLAVE_SESION,
        CLAVE_COLA_FIFO: CLAVE_COLA_FIFO,
        CLAVE_CACHE_PROMO: CLAVE_CACHE_PROMO,
        normalizarRol: normalizarRol,
        obtenerSesion: obtenerSesion,
        guardarSesion: guardarSesion,
        cerrarSesion: cerrarSesion,
        obtenerIdsPedidosSesion: obtenerIdsPedidosSesion,
        registrarIdPedidoSesion: registrarIdPedidoSesion,
        obtenerColaFIFO: obtenerColaFIFO,
        guardarColaFIFO: guardarColaFIFO,
        sincronizarColaFifo: sincronizarColaFifo,
        sincronizarColaFIFO: sincronizarColaFifo,
        listarTabla: listarTabla,
        listarProductosExtraConCache: listarProductosExtraConCache,
        insertarRegistro: insertarRegistro,
        actualizarPorId: actualizarPorId,
        eliminarPorId: eliminarPorId,
        iniciarSesionCuenta: iniciarSesionCuenta,
        registrarCuenta: registrarCuenta,
        obtenerCachePromocion: obtenerCachePromocion,
        guardarCachePromocion: guardarCachePromocion,
        obtenerPromocionActiva: obtenerPromocionActiva,
        guardarPromocion: guardarPromocion,
        guardarPromocionActiva: guardarPromocion,
        registrarActividad: registrarActividad,
        purgarActividadProyecto: purgarActividadProyecto
    };
})(window);

// ==========================================
// BLOQUE 2 - Pruebas de Integridad del Sistema
// ==========================================
// Semana 3 - Desarrollo Agil y Smoke Testing
document.addEventListener('DOMContentLoaded', () => {
    const botonSmokeTest = document.getElementById('btnSmokeTest');
    const salidaAuditoria = document.getElementById('salidaAudit');
    if (!botonSmokeTest || !salidaAuditoria) return;
    botonSmokeTest.addEventListener('click', () => {
        const imgsSinAlt = document.querySelectorAll('img:not([alt]), img[alt=""]').length;
        const enlacesVacios = document.querySelectorAll('a[href=""], a:not([href])').length;
        const totalBotones = document.querySelectorAll('button').length;
        salidaAuditoria.textContent = `Smoke Test OK | Botones: ${totalBotones} | Imagenes sin alt: ${imgsSinAlt} | Enlaces vacios: ${enlacesVacios}`;
    });
});

// ==========================================
// BLOQUE 3 - Auditoria de Accesibilidad A11Y
// ==========================================
// Semana 3 - Cierre A11Y HTML5 y HMR
document.addEventListener('DOMContentLoaded', () => {
    const botonAuditar = document.getElementById('btnAuditarA11Y');
    const salidaReporte = document.getElementById('reporteA11Y');
    if (!botonAuditar || !salidaReporte) return;
    botonAuditar.addEventListener('click', () => {
        const zonasSemanticas = document.querySelectorAll('header, nav, main, article, footer').length;
        const imagenesSinAlt = document.querySelectorAll('img:not([alt]), img[alt=""]').length;
        salidaReporte.textContent = `Auditoria en vivo: ${zonasSemanticas} etiquetas semanticas HTML5 detectadas | Imagenes sin alt: ${imagenesSinAlt}.`;
    });
});

// ==========================================
// BLOQUE 4 - Logica Principal de Interfaz, Catalogo, Carrito y Eventos
// ==========================================
// Semana 1 - Modo Oscuro
const CONFIG_NEGOCIO = {
    proyecto: 'catalogo_snoopy',
    nombreMarca: 'Cotillones Snoopy',
    nombreCorto: 'SnoopyCotillon',
    subtitulo: 'Velas, Globos, Toppers, Decoracion y Baby Shower',
    moneda: 'Bs.',
    tarifaCalculador: 25,
    catalogoUrl: './data/catalogo.json',
    subcategoriasPorLinea: {
        'Velas y Toppers': [
            { clave: 'Velas Clasicas', etiqueta: 'Velas Clasicas' },
            { clave: 'Velas Especiales', etiqueta: 'Velas Especiales' },
            { clave: 'Cake Toppers', etiqueta: 'Cake Toppers' }
        ],
        'Vajilla y Decoracion': [
            { clave: 'Platillos y Vasos', etiqueta: 'Platillos y Vasos' },
            { clave: 'Bombillas y Servilletas', etiqueta: 'Bombillas y Servilletas' },
            { clave: 'Porta Globos y Cortinas', etiqueta: 'Porta Globos y Cortinas' }
        ],
        'Globos y Pinatas': [
            { clave: 'Pinatas e Invitaciones', etiqueta: 'Pinatas e Invitaciones' },
            { clave: 'Banderines y Bandas', etiqueta: 'Banderines y Bandas' },
            { clave: 'Manteles', etiqueta: 'Manteles' },
            { clave: 'Globos', etiqueta: 'Globos' }
        ],
        'Baby Shower y Eventos': [
            { clave: 'Baby Shower', etiqueta: 'Baby Shower' },
            { clave: 'Kits y Vestidos', etiqueta: 'Kits y Vestidos' }
        ]
    }
};

const CLASE_BANNER_CATEGORIA = {
    'Velas y Toppers': 'banner-linea--velas',
    'Vajilla y Decoracion': 'banner-linea--vajilla',
    'Globos y Pinatas': 'banner-linea--globos',
    'Baby Shower y Eventos': 'banner-linea--eventos'
};

const CLASE_MEDIA_CATEGORIA = {
    'Velas y Toppers': 'card-item__media--velas',
    'Vajilla y Decoracion': 'card-item__media--vajilla',
    'Globos y Pinatas': 'card-item__media--globos',
    'Baby Shower y Eventos': 'card-item__media--eventos'
};

const PAQUETES_RECOMENDADOS = [
    {
        id: 'PACK-01',
        sku: 'CS-PACK-01',
        orden: 901,
        nombre: 'Combo Cumpleanos Infantil Completo',
        alt: 'Fotografia real del Combo Cumpleanos Infantil Completo Cotillones Snoopy',
        categoria: 'Baby Shower y Eventos',
        subcategoria: 'Kits y Vestidos',
        tematica: 'Pinata de caricaturas, banderin, velas de numeros, platillos y vasos',
        presentacion: 'Combo completo listo para festejar',
        precio: 65,
        stock: 30,
        descripcion: 'Reune pinata tematica, banderin Feliz Cumpleanos, velas numericas, vasos y platillos de caricaturas.',
        fichaTecnica: 'Puedes elegir caricatura favorita (Sonic, Paw Patrol, Minnie, Avengers, Kuromi) al confirmar.',
        portada: 'https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AMQg-rsxd3ZGwC9a777Ye5s/CS-26.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1'
    },
    {
        id: 'PACK-02',
        sku: 'CS-PACK-02',
        orden: 902,
        nombre: 'Pack Decoracion Luces LED, Cortina y Globos',
        alt: 'Fotografia real del Pack Decoracion Luces LED, Cortina y Globos Cotillones Snoopy',
        categoria: 'Vajilla y Decoracion',
        subcategoria: 'Porta Globos y Cortinas',
        tematica: 'Porta globos LED, cortina tornasol, globos metalicos y topper',
        presentacion: 'Pack decorativo para pared y mesa principal',
        precio: 72,
        stock: 25,
        descripcion: 'Porta globos con luces LED, cortina pastel tornasol, globos metalicos multicolor y topper Feliz Cumpleanos.',
        fichaTecnica: 'Armado sencillo para destacar la mesa de torta en fotos diurnas y nocturnas.',
        portada: 'https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AKvcUKVpA6ooTR_0_0z8EFA/CS-19.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1'
    },
    {
        id: 'PACK-03',
        sku: 'CS-PACK-03',
        orden: 903,
        nombre: 'Kit Revelacion de Sexo Baby Shower',
        alt: 'Fotografia real del Kit Revelacion de Sexo Baby Shower Cotillones Snoopy',
        categoria: 'Baby Shower y Eventos',
        subcategoria: 'Baby Shower',
        tematica: 'Balon revelador, spray revelador y globos Nino o Nina',
        presentacion: 'Kit completo de revelacion celeste o rosado',
        precio: 85,
        stock: 20,
        descripcion: 'Incluye balon revelador de sexo, spray revelador, globos Nino o Nina y globos Minnie y Mickey Bebe.',
        fichaTecnica: 'Empaque discreto para mantener la sorpresa hasta el momento exacto del baby shower.',
        portada: 'https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ADif1Ot9NqVbCDnF6EDLr9Q/CS-58.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1'
    }
];

// Semana 2 - Respaldo Completo de 64 Productos Cotillones Snoopy
const CATALOGO_RESPALDO = [
    {
        "id": "CS-01",
        "sku": "CS-VT-01",
        "orden": 1,
        "nombre": "Velas de Numeros",
        "alt": "Fotografia real de Velas de Numeros en colores azul, dorado, rosado, plateado, rojo y futbol",
        "categoria": "Velas y Toppers",
        "subcategoria": "Velas Clasicas",
        "tematica": "Azul, dorado, rosado, plateado, rojo y balones de futbol",
        "presentacion": "Unidad con soporte plastico para torta",
        "precio": 6.0,
        "stock": 120,
        "descripcion": "Velas numericas clasicas y tematicas en azul, dorado, rosado, plateado, rojo y diseno de balones de futbol.",
        "fichaTecnica": "Disponibles del 0 al 9 en acabados brillantes y deportivos. Base limpia para colocar facilmente sobre tortas y cupcakes.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AAe4x9ugNj61U2CNbJqVZK8/CS-01.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-02",
        "sku": "CS-VT-02",
        "orden": 2,
        "nombre": "Velitas Medianas Plateadas",
        "alt": "Fotografia real de Velitas Medianas Plateadas para cumpleanos",
        "categoria": "Velas y Toppers",
        "subcategoria": "Velas Clasicas",
        "tematica": "Acabado metalico plateado elegante",
        "presentacion": "Set de velitas medianas con portavelas",
        "precio": 10.0,
        "stock": 95,
        "descripcion": "Juego de velitas medianas con brillo plateado ideal para tortas de cumpleanos y aniversarios.",
        "fichaTecnica": "Combustion pareja sin goteo excesivo. Incluye bases individuales para insertar de forma higienica.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AFH7PdtoIExoMEBesRVTsLg/CS-02.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-03",
        "sku": "CS-VT-03",
        "orden": 3,
        "nombre": "Velas Combinadas Rosado y Dorado",
        "alt": "Fotografia real de Velas Combinadas Rosado y Dorado para fiestas",
        "categoria": "Velas y Toppers",
        "subcategoria": "Velas Especiales",
        "tematica": "Combinacion rosado pastel y dorado metalico",
        "presentacion": "Pack surtido con soportes",
        "precio": 10.0,
        "stock": 85,
        "descripcion": "Velas estilizadas que combinan tonos rosado y dorado para celebraciones femeninas y quinceaneras.",
        "fichaTecnica": "Acabado satinado y metalizado. Combina con decoraciones pastel, coronas y toppers dorados.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AIIf2I5V9NkYq1FQVvgJzUE/CS-03.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-04",
        "sku": "CS-VT-04",
        "orden": 4,
        "nombre": "Velas Largas Negro y Dorado",
        "alt": "Fotografia real de Velas Largas Negro y Dorado para tortas elegantes",
        "categoria": "Velas y Toppers",
        "subcategoria": "Velas Especiales",
        "tematica": "Negro brillante y dorado de gala",
        "presentacion": "Pack de velas largas estilizadas",
        "precio": 10.0,
        "stock": 70,
        "descripcion": "Velas largas de estilo moderno en contraste negro y dorado para fiestas nocturnas y adultos.",
        "fichaTecnica": "Altura extendida de 14 cm con base protectora. Ideales para tortas altas y celebraciones de gala.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AJWjd_9Q1CHgtK3hcqj0NvI/CS-04.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-05",
        "sku": "CS-VT-05",
        "orden": 5,
        "nombre": "Velas Multicolor con Destellos",
        "alt": "Fotografia real de Velas Multicolor con Destellos para cumpleanos",
        "categoria": "Velas y Toppers",
        "subcategoria": "Velas Especiales",
        "tematica": "Colores alegres con brillo festivo",
        "presentacion": "Pack surtido multicolor",
        "precio": 10.0,
        "stock": 90,
        "descripcion": "Velas multicolor con acabado de destellos pensadas para llenar de alegria cualquier torta infantil.",
        "fichaTecnica": "Colores variados con brillo escarchado. Incluye soportes individuales listos para usar.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AJtFK6JUvOyHS2G5I-1L71E/CS-05.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-06",
        "sku": "CS-VT-06",
        "orden": 6,
        "nombre": "Velas Largas Doradas y Plateadas",
        "alt": "Fotografia real de Velas Largas Doradas y Plateadas metalicas",
        "categoria": "Velas y Toppers",
        "subcategoria": "Velas Especiales",
        "tematica": "Doble tono metalico dorado y plateado",
        "presentacion": "Pack combinado de velas largas",
        "precio": 10.0,
        "stock": 88,
        "descripcion": "Set elegante de velas largas en tonos dorado y plateado metalizado para tortas de celebracion.",
        "fichaTecnica": "Cera refinada de llama estable. Perfectas para bodas, graduaciones y cumpleanos especiales.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ALGq4fjPBylTNktha_iq6Ho/CS-06.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-07",
        "sku": "CS-VT-07",
        "orden": 7,
        "nombre": "Velas Bengala Chispitas",
        "alt": "Fotografia real de Velas Bengala Chispitas luminosas para torta",
        "categoria": "Velas y Toppers",
        "subcategoria": "Velas Especiales",
        "tematica": "Efecto chispitas luminosas para el momento del canto",
        "presentacion": "Pack de velas bengala con punta plastica",
        "precio": 15.0,
        "stock": 75,
        "descripcion": "Velas tipo bengala con efecto chispitas doradas para sorprender al cantar feliz cumpleanos.",
        "fichaTecnica": "Encendido rapido y efecto luminoso brillante de bajo humo. Utilizar bajo supervision de un adulto.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AG8jvc8XOg2jOZ7dV6qCXI4/CS-07.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-08",
        "sku": "CS-VT-08",
        "orden": 8,
        "nombre": "Velas Enrolladas Multicolor",
        "alt": "Fotografia real de Velas Enrolladas Multicolor en espiral",
        "categoria": "Velas y Toppers",
        "subcategoria": "Velas Especiales",
        "tematica": "Diseno espiral divertido en colores surtidos",
        "presentacion": "Pack de velas en espiral multicolor",
        "precio": 10.0,
        "stock": 80,
        "descripcion": "Velas con forma enrollada en espiral de colores vibrantes que destacan sobre cualquier torta.",
        "fichaTecnica": "Formato liviano y divertido con soportes plasticos. Ideal para fiestas infantiles y tematicas coloridas.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ACfiZ2sFO0z8sGpFGCQsxn4/CS-08.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-09",
        "sku": "CS-VT-09",
        "orden": 9,
        "nombre": "Velas Corazon con Curvas",
        "alt": "Fotografia real de Velas Corazon con Curvas para celebraciones",
        "categoria": "Velas y Toppers",
        "subcategoria": "Velas Especiales",
        "tematica": "Silueta de corazon con tallo curvo decorativo",
        "presentacion": "Pack de velas forma corazon",
        "precio": 10.0,
        "stock": 74,
        "descripcion": "Velas romanticas y tiernas con forma de corazon y soporte curvo para aniversarios y cumpleanos.",
        "fichaTecnica": "Acabado brillante con base firme. Perfectas para tortas de pareja, amigas y festejos especiales.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AIoDYveqyrl2r1VONZYWlQM/CS-09.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-10",
        "sku": "CS-VT-10",
        "orden": 10,
        "nombre": "Topper Feliz Cumpleanos",
        "alt": "Fotografia real de Topper Feliz Cumpleanos decorativo para torta",
        "categoria": "Velas y Toppers",
        "subcategoria": "Cake Toppers",
        "tematica": "Cartel decorativo principal Feliz Cumpleanos",
        "presentacion": "Topper individual listo para insertar",
        "precio": 10.0,
        "stock": 90,
        "descripcion": "Topper central de Feliz Cumpleanos con tipografia festiva para coronar tu torta principal.",
        "fichaTecnica": "Material liviano resistente con palillo seguro para reposteria. Reutilizable si se limpia en seco.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AHml9LJ-rHa_gwbt73SmUD8/CS-10.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-11",
        "sku": "CS-VT-11",
        "orden": 11,
        "nombre": "Decoraciones de Estrellas para Torta",
        "alt": "Fotografia real de Decoraciones de Estrellas para Torta brillantes",
        "categoria": "Velas y Toppers",
        "subcategoria": "Cake Toppers",
        "tematica": "Estrellas escarchadas doradas y plateadas",
        "presentacion": "Set de toppers estrella con varillas",
        "precio": 6.0,
        "stock": 110,
        "descripcion": "Set de estrellas brillantes con palillos para decorar tortas, cupcakes y mesas dulces.",
        "fichaTecnica": "Acabado brillante de facil colocacion. Combina con cualquier topper central o vela de numero.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AFWRq3RTRp2BfDmQFs3En00/CS-11.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-12",
        "sku": "CS-VT-12",
        "orden": 12,
        "nombre": "Topper Feliz Cumpleanos Colores",
        "alt": "Fotografia real de Topper Feliz Cumpleanos Colores naranja, dorado, rosado y azul",
        "categoria": "Velas y Toppers",
        "subcategoria": "Cake Toppers",
        "tematica": "Naranja, dorado, rosado y azul festivo",
        "presentacion": "Topper individual a eleccion de color",
        "precio": 6.0,
        "stock": 105,
        "descripcion": "Topper Feliz Cumpleanos disponible en colores naranja, dorado, rosado y azul para combinar con tu fiesta.",
        "fichaTecnica": "Corte limpio y liviano ideal para tortas caseras o de pasteleria. Consulta tu color preferido al pedir.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ALdZ8BNWe2AH55uRSM7ahUY/CS-12.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-13",
        "sku": "CS-VT-13",
        "orden": 13,
        "nombre": "Topper de Caricaturas",
        "alt": "Fotografia real de Topper de Caricaturas Superheroes, Paw Patrol, Sonic, Minnie, Elsa, Sofia y Sirenita",
        "categoria": "Velas y Toppers",
        "subcategoria": "Cake Toppers",
        "tematica": "Superheroes, Paw Patrol, Sonic, Minnie, Elsa, Sofia y Sirenita",
        "presentacion": "Set de toppers tematicos de personaje",
        "precio": 7.0,
        "stock": 115,
        "descripcion": "Toppers de personajes favoritos: Superheroes, Paw Patrol, Sonic, Minnie, Elsa, Sofia y Sirenita.",
        "fichaTecnica": "Impresion a todo color con palillos listos para armar sobre la torta. Indica tu personaje en el pedido.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AI-oh44hrMx_cvYFrdGKp4w/CS-13.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-14",
        "sku": "CS-VT-14",
        "orden": 14,
        "nombre": "Topper Feliz Cumpleanos Azul y Rojo",
        "alt": "Fotografia real de Topper Feliz Cumpleanos Azul y Rojo brillante",
        "categoria": "Velas y Toppers",
        "subcategoria": "Cake Toppers",
        "tematica": "Contraste azul vibrante y rojo festivo",
        "presentacion": "Topper individual con soporte doble",
        "precio": 8.0,
        "stock": 82,
        "descripcion": "Topper llamativo en colores azul y rojo ideal para tematicas de superheroes, futbol y cumpleanos.",
        "fichaTecnica": "Acabado brillante y firme para lucir en fotografias de la mesa principal.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AD29KT3FkCyylLAjfRVF87g/CS-14.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-15",
        "sku": "CS-VD-15",
        "orden": 15,
        "nombre": "Platillos Variados Caricaturas y Cumpleanos",
        "alt": "Fotografia real de Platillos Variados Caricaturas y Cumpleanos para mesa",
        "categoria": "Vajilla y Decoracion",
        "subcategoria": "Platillos y Vasos",
        "tematica": "Caricaturas infantiles y motivos de cumpleanos",
        "presentacion": "Paquete de platillos descartables de fiesta",
        "precio": 10.0,
        "stock": 140,
        "descripcion": "Platillos resistentes decorados con caricaturas populares y mensajes de feliz cumpleanos.",
        "fichaTecnica": "Carton plastificado apto para torta y bocaditos dulces o salados. Consulta disenos disponibles.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ABfmtdKi7G3Q7Gg5GbZtTKc/CS-15.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-16",
        "sku": "CS-VD-16",
        "orden": 16,
        "nombre": "Vasos Variados Colores y Disenos",
        "alt": "Fotografia real de Vasos Variados Colores y Disenos para fiestas",
        "categoria": "Vajilla y Decoracion",
        "subcategoria": "Platillos y Vasos",
        "tematica": "Colores vivos y estampados de celebracion",
        "presentacion": "Paquete de vasos tematicos descartables",
        "precio": 10.0,
        "stock": 135,
        "descripcion": "Vasos festivos en colores alegres y disenos variados que combinan con los platillos del catalogo.",
        "fichaTecnica": "Aptos para bebidas frias y refrescos. Borde suave y estructura firme para ninos y adultos.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ADARQleB56CyrsBkaRKYKnk/CS-16.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-17",
        "sku": "CS-VD-17",
        "orden": 17,
        "nombre": "Bombillas de Pelotas de Futbol",
        "alt": "Fotografia real de Bombillas de Pelotas de Futbol para bebidas",
        "categoria": "Vajilla y Decoracion",
        "subcategoria": "Bombillas y Servilletas",
        "tematica": "Tematica deportiva de futbol para ninos y jovenes",
        "presentacion": "Pack de bombillas decoradas con pelotas",
        "precio": 6.0,
        "stock": 100,
        "descripcion": "Bombillas divertidas con aplique de pelotas de futbol ideales para cumpleanos futboleros.",
        "fichaTecnica": "Aplique decorativo llamativo y practico para vasos de refresco y jugos en mesas tematicas.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AL9dvZJdjCYMyHnpqeobPuE/CS-17.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-18",
        "sku": "CS-VD-18",
        "orden": 18,
        "nombre": "Servilletas Tematicas Camiones y Selva",
        "alt": "Fotografia real de Servilletas Tematicas Camiones y Selva",
        "categoria": "Vajilla y Decoracion",
        "subcategoria": "Bombillas y Servilletas",
        "tematica": "Estampados infantiles de camiones y animales de selva",
        "presentacion": "Paquete de servilletas impresas de fiesta",
        "precio": 6.0,
        "stock": 105,
        "descripcion": "Servilletas suaves estampadas con motivos de camiones y selva para complementar mesas infantiles.",
        "fichaTecnica": "Papel absorbente de doble hoja con impresion nitida a color. Ideales para mesa de bocaditos.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AGgTFkzmayHBpgm2xMewLfA/CS-18.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-19",
        "sku": "CS-VD-19",
        "orden": 19,
        "nombre": "Porta Globos con Luces LED",
        "alt": "Fotografia real de Porta Globos con Luces LED para centro de mesa",
        "categoria": "Vajilla y Decoracion",
        "subcategoria": "Porta Globos y Cortinas",
        "tematica": "Base iluminada con luces LED calidas y multicolor",
        "presentacion": "Kit armable con base, varillas y tira LED",
        "precio": 25.0,
        "stock": 48,
        "descripcion": "Soporte porta globos de mesa con luces LED integradas para destacar la decoracion nocturna.",
        "fichaTecnica": "Facil armado en minutos y reutilizable en futuros eventos. Realza globos metalicos y transparentes.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AKvcUKVpA6ooTR_0_0z8EFA/CS-19.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-20",
        "sku": "CS-VD-20",
        "orden": 20,
        "nombre": "Porta Globos con Luces",
        "alt": "Fotografia real de Porta Globos con Luces decorativas para fiestas",
        "categoria": "Vajilla y Decoracion",
        "subcategoria": "Porta Globos y Cortinas",
        "tematica": "Soporte luminoso para arreglos de mesa principal",
        "presentacion": "Base armable con varillas y luces",
        "precio": 25.0,
        "stock": 44,
        "descripcion": "Porta globos con luces brillantes ideal para ambientar la mesa de torta y rincon de fotos.",
        "fichaTecnica": "Estructura liviana de armado rapido con varios niveles de altura para crear volumen sin helio.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AJZFDPi0yZX1uZNEri7oiz4/CS-20.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-21",
        "sku": "CS-VD-21",
        "orden": 21,
        "nombre": "Porta Globos Simple",
        "alt": "Fotografia real de Porta Globos Simple armable para mesa",
        "categoria": "Vajilla y Decoracion",
        "subcategoria": "Porta Globos y Cortinas",
        "tematica": "Soporte clasico de mesa sin necesidad de helio",
        "presentacion": "Base plastica con varillas y copas",
        "precio": 10.0,
        "stock": 95,
        "descripcion": "Porta globos simple y practico para lograr ramos de globos firmes sobre cualquier mesa.",
        "fichaTecnica": "Compatible con globos de latex y metalicos pequenos. Reutilizable y facil de guardar.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ABIR6vlmVFN0wJvE0NfCK_I/CS-21.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-22",
        "sku": "CS-VD-22",
        "orden": 22,
        "nombre": "Cortinas Redondas Varios Colores",
        "alt": "Fotografia real de Cortinas Redondas Varios Colores para fondo de fiesta",
        "categoria": "Vajilla y Decoracion",
        "subcategoria": "Porta Globos y Cortinas",
        "tematica": "Fondo decorativo metalico con corte redondo en varios colores",
        "presentacion": "Cortina metalica decorativa 1x2 m aprox.",
        "precio": 10.0,
        "stock": 85,
        "descripcion": "Cortinas metalicas con diseno redondo disponibles en varios colores para fondos fotograficos.",
        "fichaTecnica": "Incluye cinta adhesiva superior para pegar en paredes o marcos sin danar la superficie.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/APMQOMga1_-W01Eo4uL8pz0/CS-22.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-23",
        "sku": "CS-VD-23",
        "orden": 23,
        "nombre": "Cortinas Corazon Varios Colores",
        "alt": "Fotografia real de Cortinas Corazon Varios Colores para decoracion",
        "categoria": "Vajilla y Decoracion",
        "subcategoria": "Porta Globos y Cortinas",
        "tematica": "Tiras brillantes con corazones troquelados",
        "presentacion": "Cortina metalica decorativa troquelada",
        "precio": 12.0,
        "stock": 76,
        "descripcion": "Cortinas metalizadas con siluetas de corazon en colores surtidos para fondos romanticos y festivos.",
        "fichaTecnica": "Brillo intenso ideal para fotos con flash, cumpleanos, quinceaneras y san valentin.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AFRDO4j-pMDXMAbLlapdHDI/CS-23.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-24",
        "sku": "CS-VD-24",
        "orden": 24,
        "nombre": "Cortinas Plateadas",
        "alt": "Fotografia real de Cortinas Plateadas metalicas para fondo de fotos",
        "categoria": "Vajilla y Decoracion",
        "subcategoria": "Porta Globos y Cortinas",
        "tematica": "Flecos metalicos plateados efecto espejo",
        "presentacion": "Cortina metalica plateada 1x2 m aprox.",
        "precio": 10.0,
        "stock": 110,
        "descripcion": "Cortina clasica de flecos plateados brillantes para pared de torta, graduaciones y fiestas.",
        "fichaTecnica": "Combina con globos de cualquier color. Se recomienda usar dos unidades para cubrir paredes amplias.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AIQvvZ2Ot6FdXmfoGMYEJSc/CS-24.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-25",
        "sku": "CS-VD-25",
        "orden": 25,
        "nombre": "Cortinas Pastel Tornasol",
        "alt": "Fotografia real de Cortinas Pastel Tornasol iridiscentes",
        "categoria": "Vajilla y Decoracion",
        "subcategoria": "Porta Globos y Cortinas",
        "tematica": "Brillo tornasol pastel multicolor",
        "presentacion": "Cortina iridiscente decorativa",
        "precio": 12.0,
        "stock": 78,
        "descripcion": "Cortinas en tonos pastel con efecto tornasol que cambian suavemente de color con la luz.",
        "fichaTecnica": "Tendencia favorita para fiestas de unicornio, sirenas, baby shower y cumpleanos modernos.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AEHMt6K2dPe-QTqakEqv25Q/CS-25.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-26",
        "sku": "CS-GP-26",
        "orden": 26,
        "nombre": "Pinatas de Caricaturas",
        "alt": "Fotografia real de Pinatas de Caricaturas coloridas para cumpleanos",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Pinatas e Invitaciones",
        "tematica": "Personajes infantiles populares listos para rellenar",
        "presentacion": "Pinata resistente con cuerda para colgar",
        "precio": 25.0,
        "stock": 40,
        "descripcion": "Pinatas coloridas con disenos de caricaturas favoritas para el momento mas esperado de la fiesta.",
        "fichaTecnica": "Espacio interior amplio para dulces, sorpresas y confeti. Consulta personajes en stock.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AMQg-rsxd3ZGwC9a777Ye5s/CS-26.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-27",
        "sku": "CS-GP-27",
        "orden": 27,
        "nombre": "Invitaciones Variadas y Simples",
        "alt": "Fotografia real de Invitaciones Variadas y Simples para fiestas",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Pinatas e Invitaciones",
        "tematica": "Tarjetas impresas infantiles y clasicas para llenar",
        "presentacion": "Paquete de tarjetas de invitacion",
        "precio": 10.0,
        "stock": 95,
        "descripcion": "Tarjetas de invitacion en modelos variados y simples con espacios claros para fecha, hora y direccion.",
        "fichaTecnica": "Cartulina impresa a color facil de escribir con boligrafo o marcador.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/APThRMFcUAlc2GD4ElpYPwQ/CS-27.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-28",
        "sku": "CS-GP-28",
        "orden": 28,
        "nombre": "Banderines Feliz Cumpleanos",
        "alt": "Fotografia real de Banderines Feliz Cumpleanos para colgar",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Banderines y Bandas",
        "tematica": "Guirnalda clasica Feliz Cumpleanos",
        "presentacion": "Banderin completo con cinta para colgar",
        "precio": 11.0,
        "stock": 90,
        "descripcion": "Banderin decorativo con letras de Feliz Cumpleanos para destacar la pared principal del festejo.",
        "fichaTecnica": "Cartulina resistente con perforaciones y cinta incluida para colocacion inmediata.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AHO0S9Pn6UzaYwtH0Pl-Lhk/CS-28.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-29",
        "sku": "CS-GP-29",
        "orden": 29,
        "nombre": "Banderines Feliz Cumpleanos Rosado, Amarillo y Morado",
        "alt": "Fotografia real de Banderines Feliz Cumpleanos en colores rosado, amarillo y morado",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Banderines y Bandas",
        "tematica": "Paleta alegre rosado, amarillo y morado",
        "presentacion": "Guirnalda completa con cordon",
        "precio": 9.0,
        "stock": 86,
        "descripcion": "Banderines de Feliz Cumpleanos en combinacion rosado, amarillo y morado de gran contraste visual.",
        "fichaTecnica": "Livianos y reutilizables. Ideales para combinar con globos metalicos y cortinas pastel.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AKYJeNn3J0_WraR5ecetjLM/CS-29.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-30",
        "sku": "CS-GP-30",
        "orden": 30,
        "nombre": "Banderines con Cortina",
        "alt": "Fotografia real de Banderines con Cortina decorativa combinada",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Banderines y Bandas",
        "tematica": "Set coordinado de banderin mas cortina brillante",
        "presentacion": "Duo decorativo listo para pared de fotos",
        "precio": 15.0,
        "stock": 70,
        "descripcion": "Combo practico que une banderines de cumpleanos y cortina brillante en un solo paquete.",
        "fichaTecnica": "Ahorra tiempo al decorar tu mesa principal con colores perfectamente combinados.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AK5cvClJtAXTeR5nfF8I12M/CS-30.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-31",
        "sku": "CS-GP-31",
        "orden": 31,
        "nombre": "Banderin Feliz Cumpleanos Pastel",
        "alt": "Fotografia real de Banderin Feliz Cumpleanos Pastel suave",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Banderines y Bandas",
        "tematica": "Tonos pastel suaves con letras brillantes",
        "presentacion": "Banderin completo con cinta",
        "precio": 12.0,
        "stock": 80,
        "descripcion": "Banderin Feliz Cumpleanos en gama pastel delicada para fiestas luminosas y elegantes.",
        "fichaTecnica": "Cartulina de buen gramaje con acabado mate suave. Combina con cortina pastel tornasol.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ADx841P2qW0A8b_ZmMBgA3M/CS-31.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-32",
        "sku": "CS-GP-32",
        "orden": 32,
        "nombre": "Banderines de Kuromi",
        "alt": "Fotografia real de Banderines de Kuromi en tonos lila y rosado",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Banderines y Bandas",
        "tematica": "Tematica Kuromi en morado, negro y rosado",
        "presentacion": "Guirnalda tematica Kuromi lista para colgar",
        "precio": 15.0,
        "stock": 62,
        "descripcion": "Banderines tematicos de Kuromi muy pedidos para cumpleanos juveniles e infantiles.",
        "fichaTecnica": "Impresion a color de alta definicion con cinta incluida. Destaca junto a globos lilas y plateados.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AMcF8BtK_gIPk-mqbnmN_V4/CS-32.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-33",
        "sku": "CS-GP-33",
        "orden": 33,
        "nombre": "Banda de Colores Blanco, Rosado y Celeste",
        "alt": "Fotografia real de Banda de Colores Blanco, Rosado y Celeste para cumpleanero",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Banderines y Bandas",
        "tematica": "Banda satinada en blanco, rosado y celeste",
        "presentacion": "Banda festiva individual talla unica",
        "precio": 15.0,
        "stock": 65,
        "descripcion": "Banda de celebracion satinada disponible en blanco, rosado y celeste para el protagonista del evento.",
        "fichaTecnica": "Tela satinada comoda de llevar durante toda la fiesta y perfecta para las fotos de recuerdo.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/APvPAa2buC7tZ-y5ULV6dAw/CS-33.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-34",
        "sku": "CS-GP-34",
        "orden": 34,
        "nombre": "Banda Happy Birthday Plateada",
        "alt": "Fotografia real de Banda Happy Birthday Plateada con brillo",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Banderines y Bandas",
        "tematica": "Banda plateada brillante con mensaje Happy Birthday",
        "presentacion": "Banda de celebracion talla unica",
        "precio": 15.0,
        "stock": 60,
        "descripcion": "Banda elegante color plata con letras Happy Birthday para destacar al cumpleanero o cumpleanera.",
        "fichaTecnica": "Acabado brillante ligero y resistente. Ideal para cumpleanos de 15, 18, 21 y festejos adultos.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AKinVfJ8Ts8qHZsABAnc8dI/CS-34.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-35",
        "sku": "CS-GP-35",
        "orden": 35,
        "nombre": "Mantel de Cartas",
        "alt": "Fotografia real de Mantel de Cartas para mesa de juegos y celebracion",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Manteles",
        "tematica": "Estampado divertido de cartas y juegos",
        "presentacion": "Mantel impermeable rectangular",
        "precio": 10.0,
        "stock": 72,
        "descripcion": "Mantel decorativo con tematica de cartas ideal para reuniones, noches de juegos y cumpleanos tematicos.",
        "fichaTecnica": "Material plastico impermeable facil de limpiar y protege la mesa de salpicaduras.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AJroep3weWOjKLciRqp7VHA/CS-35.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-36",
        "sku": "CS-GP-36",
        "orden": 36,
        "nombre": "Mantel Feliz Cumpleanos",
        "alt": "Fotografia real de Mantel Feliz Cumpleanos colorido para mesa principal",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Manteles",
        "tematica": "Diseno festivo Feliz Cumpleanos con globos y confeti",
        "presentacion": "Mantel impermeable rectangular de fiesta",
        "precio": 10.0,
        "stock": 115,
        "descripcion": "Mantel colorido de Feliz Cumpleanos que viste de inmediato la mesa de torta y bocaditos.",
        "fichaTecnica": "Resistente a derrames de bebidas y crema. Superficie brillante y liviana.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AOSG2ZKRtOBiUwdiSA2z3LU/CS-36.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-37",
        "sku": "CS-GP-37",
        "orden": 37,
        "nombre": "Globos Metalicos Multicolor",
        "alt": "Fotografia real de Globos Metalicos Multicolor brillantes",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Surtido metalico multicolor de alto brillo",
        "presentacion": "Pack de globos metalicos surtidos",
        "precio": 25.0,
        "stock": 75,
        "descripcion": "Juego de globos metalicos multicolor con brillo espejo para arcos y ramos llamativos.",
        "fichaTecnica": "Aptos para inflado con aire o helio. Valvula autosellante de larga duracion.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AC12o7HGbOd9euTkHhbfFTE/CS-37.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-38",
        "sku": "CS-GP-38",
        "orden": 38,
        "nombre": "Globos Metalicos Plateado, Rosado, Amarillo y Verde",
        "alt": "Fotografia real de Globos Metalicos en plateado, rosado, amarillo y verde",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Combinacion plateado, rosado, amarillo y verde metalizado",
        "presentacion": "Pack combinado de globos metalicos",
        "precio": 20.0,
        "stock": 70,
        "descripcion": "Globos metalicos en seleccion plateado, rosado, amarillo y verde para crear arreglos vibrantes.",
        "fichaTecnica": "Superficie reflectiva resistente que mantiene el inflado por varios dias.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AP9bRe9nlqLE4U0Q87Aw-LE/CS-38.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-39",
        "sku": "CS-GP-39",
        "orden": 39,
        "nombre": "Globos Normales x50 Unidades",
        "alt": "Fotografia real de bolsa de Globos Normales x50 Unidades de latex",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Bolsa economica de 50 globos de colores",
        "presentacion": "Paquete x 50 unidades de latex",
        "precio": 15.0,
        "stock": 160,
        "descripcion": "Paquete rendidor de 50 globos de latex clasicos ideales para arcos, guirnaldas y juegos.",
        "fichaTecnica": "Latex flexible de facil inflado con bomba manual o electrica. Colores surtidos o a eleccion.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ALctUKBRMBJ89QIVM4ACr7w/CS-39.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-40",
        "sku": "CS-GP-40",
        "orden": 40,
        "nombre": "Globos de Numeros 7, 8, 9 y 0",
        "alt": "Fotografia real de Globos de Numeros 7, 8, 9 y 0 metalicos",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Globos numericos metalizados 7, 8, 9 y 0",
        "presentacion": "Globo metalico individual de numero",
        "precio": 10.0,
        "stock": 95,
        "descripcion": "Globos metalicos grandes con los numeros 7, 8, 9 y 0 para celebrar edades y aniversarios.",
        "fichaTecnica": "Incluye pestanas superiores para colgar con cinta o nylon. Valvula autosellante reutilizable.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AHHHgFkscfRHP4VQd6JUC_o/CS-40.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-41",
        "sku": "CS-GP-41",
        "orden": 41,
        "nombre": "Globos Dorados Numeros 1 y 6",
        "alt": "Fotografia real de Globos Dorados Numeros 1 y 6 metalizados",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Acabado dorado espejo para numeros 1 y 6",
        "presentacion": "Globo metalico dorado individual",
        "precio": 6.0,
        "stock": 90,
        "descripcion": "Globos metalicos dorados en numeros 1 y 6 ideales para primer anito, 16 anos o combinaciones.",
        "fichaTecnica": "Brillo dorado uniforme y facil inflado con bombilla incluida o inflador manual.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AKxhy_XOYXRNUnWBBVGZT-w/CS-41.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-42",
        "sku": "CS-GP-42",
        "orden": 42,
        "nombre": "Globos Caricaturas Variados",
        "alt": "Fotografia real de Globos Caricaturas Variados infantiles",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Personajes animados populares para ninos y ninas",
        "presentacion": "Globo metalico de personaje",
        "precio": 15.0,
        "stock": 88,
        "descripcion": "Globos metalicos con formas y estampados de caricaturas infantiles favoritas.",
        "fichaTecnica": "Colores brillantes de doble cara. Ideales para porta globos o entrega como sorpresa.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AJ-zCLJbjTEYDUNQcv2NdAU/CS-42.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-43",
        "sku": "CS-GP-43",
        "orden": 43,
        "nombre": "Globos y Estrellas",
        "alt": "Fotografia real de set de Globos y Estrellas metalicas",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Set combinado de globos redondos y estrellas metalicas",
        "presentacion": "Pack decorativo de globos y estrellas",
        "precio": 10.0,
        "stock": 92,
        "descripcion": "Set combinado de globos con estrellas metalicas para dar volumen y brillo a tu decoracion.",
        "fichaTecnica": "Perfecto para armar bouquets de mesa o complementar numeros metalicos.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AHFw9ybDkoqL9jrUQNTgKXc/CS-43.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-44",
        "sku": "CS-GP-44",
        "orden": 44,
        "nombre": "Globos de Patin",
        "alt": "Fotografia real de Globos de Patin retro y colorido",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Silueta divertida de patin sobre ruedas",
        "presentacion": "Globo metalico con forma de patin",
        "precio": 8.0,
        "stock": 58,
        "descripcion": "Globo metalico con original forma de patin para fiestas tematicas retro, juveniles y patinaje.",
        "fichaTecnica": "Diseno llamativo con colores brillantes y valvula autosellante.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AH2VPYjD5GINy0VlA9i-wDs/CS-44.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-45",
        "sku": "CS-GP-45",
        "orden": 45,
        "nombre": "Globos para Fiestas",
        "alt": "Fotografia real de Globos para Fiestas variados",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Surtido general alegre para toda celebracion",
        "presentacion": "Pack surtido de globos festivos",
        "precio": 10.0,
        "stock": 130,
        "descripcion": "Globos versatiles para fiestas familiares, cumpleanos, agasajos y decoraciones rapidas.",
        "fichaTecnica": "Colores intensos de buena elasticidad para inflar con aire o helio.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ADhLqO1dkNp5usMSJWuJTLI/CS-45.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-46",
        "sku": "CS-GP-46",
        "orden": 46,
        "nombre": "Globos Feliz Cumpleanos Celeste, Plateado, Verde y Dorado",
        "alt": "Fotografia real de Globos Feliz Cumpleanos en celeste, plateado, verde y dorado",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Mensaje Feliz Cumpleanos en celeste, plateado, verde y dorado",
        "presentacion": "Pack de globos impresos de cumpleanos",
        "precio": 10.0,
        "stock": 84,
        "descripcion": "Globos con mensaje Feliz Cumpleanos en combinacion celeste, plateado, verde y dorado.",
        "fichaTecnica": "Tonos frescos y brillantes ideales para celebraciones de ninos, jovenes y caballeros.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/APpY_2r1ps6z0T6noU4bj1I/CS-46.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-47",
        "sku": "CS-GP-47",
        "orden": 47,
        "nombre": "Globos Avengers",
        "alt": "Fotografia real de Globos Avengers Iron Man, Spiderman, Hulk y Capitan America",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Iron Man, Spiderman, Hulk y Capitan America",
        "presentacion": "Globo tematico de superheroes",
        "precio": 7.0,
        "stock": 105,
        "descripcion": "Globos tematicos de Avengers con Iron Man, Spiderman, Hulk y Capitan America para fiestas de superheroes.",
        "fichaTecnica": "Impresion viva y resistente. Combina con topper de caricaturas y platillos tematicos.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AOJHrIoLtrrfrEoNMijXFSc/CS-47.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-48",
        "sku": "CS-GP-48",
        "orden": 48,
        "nombre": "Globos de Graduacion",
        "alt": "Fotografia real de Globos de Graduacion dorados y negros",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Birrete y celebracion de graduacion escolar o universitaria",
        "presentacion": "Set de globos metalicos de graduacion",
        "precio": 20.0,
        "stock": 55,
        "descripcion": "Globos metalicos de graduacion con diseno de birrete y detalles dorados para celebrar logros academicos.",
        "fichaTecnica": "Acabado elegante negro y dorado listo para sesiones de fotos y recepciones.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AA9lZt2DCjonYdNDtoMJDSA/CS-48.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-49",
        "sku": "CS-GP-49",
        "orden": 49,
        "nombre": "Globo Felicidades Dorado",
        "alt": "Fotografia real de Globo Felicidades Dorado metalico",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Mensaje Felicidades en acabado dorado brillante",
        "presentacion": "Globo metalico protagonista dorado",
        "precio": 20.0,
        "stock": 52,
        "descripcion": "Globo metalico dorado con frase Felicidades para graduaciones, ascensos, bodas y cumpleanos.",
        "fichaTecnica": "Diseno de alto impacto fotografico con valvula autosellante y cinta de sujecion.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AFy97rJ8ujatbC2Ao8NmiTM/CS-49.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-50",
        "sku": "CS-GP-50",
        "orden": 50,
        "nombre": "Globo Bola de Disco",
        "alt": "Fotografia real de Globo Bola de Disco plateado esferico",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Esfera disco retro plateada 4D",
        "presentacion": "Globo metalico 4D tipo bola de disco",
        "precio": 10.0,
        "stock": 75,
        "descripcion": "Globo esferico con patron de bola de disco plateada para fiestas retro, neon y cumpleanos juveniles.",
        "fichaTecnica": "Forma esferica brillante ideal para colgar del techo o integrar en arcos organicos.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/APGRvazvVEj21le9lKz0DhE/CS-50.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-51",
        "sku": "CS-GP-51",
        "orden": 51,
        "nombre": "Globos con una Luna",
        "alt": "Fotografia real de Globos con una Luna creciente metalica",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Luna creciente brillante para fiestas de suenos y estrellas",
        "presentacion": "Set decorativo con globo de luna",
        "precio": 11.0,
        "stock": 66,
        "descripcion": "Globos con silueta de luna creciente ideales para baby shower, cumpleanos celestiales y pijamadas.",
        "fichaTecnica": "Combina facilmente con estrellas metalicas y cortinas pastel tornasol.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AEDLLggHLcw4Uks2UFxEjPE/CS-51.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-52",
        "sku": "CS-GP-52",
        "orden": 52,
        "nombre": "Globo Feliz Cumpleanos Multicolor",
        "alt": "Fotografia real de Globo Feliz Cumpleanos Multicolor",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Frase Feliz Cumpleanos en colores festivos",
        "presentacion": "Set de globos de letras multicolor",
        "precio": 15.0,
        "stock": 82,
        "descripcion": "Globo metalico Feliz Cumpleanos multicolor que llena de alegria y color cualquier pared.",
        "fichaTecnica": "Incluye popote de inflado y orificios para ensartar con cinta decorativa.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AJ73vwPu2vU-3hyvNfVpdIY/CS-52.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-53",
        "sku": "CS-GP-53",
        "orden": 53,
        "nombre": "Globos Numeros del 0 al 9 Varios Colores",
        "alt": "Fotografia real de Globos Numeros del 0 al 9 Varios Colores",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Numeracion completa del 0 al 9 en colores variados",
        "presentacion": "Globo metalico individual a eleccion",
        "precio": 8.0,
        "stock": 140,
        "descripcion": "Globos metalicos de numeros del 0 al 9 en diversos colores para armar cualquier edad o fecha.",
        "fichaTecnica": "Elige los digitos y colores al confirmar tu pedido. Autosellantes y faciles de colgar.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AGRuMx__oKDQNrxIMyx3YUY/CS-53.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-54",
        "sku": "CS-GP-54",
        "orden": 54,
        "nombre": "Globo Letras Feliz Cumpleanos Plateado y Dorado",
        "alt": "Fotografia real de Globo Letras Feliz Cumpleanos Plateado y Dorado",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Letras metalicas grandes en plateado y dorado",
        "presentacion": "Set completo de letras inflables",
        "precio": 20.0,
        "stock": 64,
        "descripcion": "Frase completa de letras inflables Feliz Cumpleanos en acabados plateado y dorado metalico.",
        "fichaTecnica": "Ideal para fondos principales de fiesta. Incluye cinta para unir y colgar comodamente.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AJ6wuBWbGgPFbXUTLJrzhjY/CS-54.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-55",
        "sku": "CS-GP-55",
        "orden": 55,
        "nombre": "Globos Numeros Grandes Plateados",
        "alt": "Fotografia real de Globos Numeros Grandes Plateados metalizados",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Formato gigante plateado de alto brillo",
        "presentacion": "Globo numero grande metalico individual",
        "precio": 11.0,
        "stock": 88,
        "descripcion": "Globos gigantes plateados con efecto espejo ideales para fotografias memorables de cumpleanos.",
        "fichaTecnica": "Gran tamano protagonista con pestanas de sujecion. Compatible con aire o helio.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AH_jz7sYUfHTJ_R6qnGES2o/CS-55.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-56",
        "sku": "CS-GP-56",
        "orden": 56,
        "nombre": "Globos MOM",
        "alt": "Fotografia real de Globos MOM para Dia de la Madre y cumpleanos",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Letras metalicas MOM para celebrar a mama",
        "presentacion": "Set de globos metalicos MOM",
        "precio": 16.0,
        "stock": 55,
        "descripcion": "Set especial de globos con palabra MOM ideal para Dia de la Madre, cumpleanos y sorpresas familiares.",
        "fichaTecnica": "Acabado brillante con valvula autosellante. Combina con velas corazon y cortinas rosadas.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ADlhHvV1mC2JzTyN6x-hj4U/CS-56.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-57",
        "sku": "CS-GP-57",
        "orden": 57,
        "nombre": "Globos DAD",
        "alt": "Fotografia real de Globos DAD para Dia del Padre y cumpleanos",
        "categoria": "Globos y Pinatas",
        "subcategoria": "Globos",
        "tematica": "Letras metalicas DAD para celebrar a papa",
        "presentacion": "Set de globos metalicos DAD",
        "precio": 16.0,
        "stock": 55,
        "descripcion": "Set de globos metalicos con palabra DAD pensado para Dia del Padre y festejos especiales.",
        "fichaTecnica": "Brillo metalico duradero y facil de montar sobre pared o mesa sorpresa.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AGNBVwSNg3NkF8MPE10L1NI/CS-57.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-58",
        "sku": "CS-BE-58",
        "orden": 58,
        "nombre": "Balon Revelador de Sexo",
        "alt": "Fotografia real de Balon Revelador de Sexo para Baby Shower",
        "categoria": "Baby Shower y Eventos",
        "subcategoria": "Baby Shower",
        "tematica": "Pelota sorpresa con polvo de color celeste o rosado",
        "presentacion": "Balon revelador listo para patear o abrir",
        "precio": 40.0,
        "stock": 35,
        "descripcion": "Balon revelador de sexo con polvo de color intenso para una revelacion emocionante y deportiva.",
        "fichaTecnica": "Disponible en version nino (celeste) o nina (rosado). Uso recomendado en espacios abiertos.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ADif1Ot9NqVbCDnF6EDLr9Q/CS-58.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-59",
        "sku": "CS-BE-59",
        "orden": 59,
        "nombre": "Spray Revelador de Sexo",
        "alt": "Fotografia real de Spray Revelador de Sexo para Baby Shower",
        "categoria": "Baby Shower y Eventos",
        "subcategoria": "Baby Shower",
        "tematica": "Nube de color sorpresa celeste o rosado",
        "presentacion": "Envase spray revelador sellado",
        "precio": 20.0,
        "stock": 50,
        "descripcion": "Spray revelador de sexo con color sorpresa cubierto para el gran momento del baby shower.",
        "fichaTecnica": "Etiqueta discreta con indicador oculto para los organizadores. Efecto fotografico espectacular.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ALtQdGykUljhBilujczc0_Y/CS-59.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-60",
        "sku": "CS-BE-60",
        "orden": 60,
        "nombre": "Globos Nino o Nina",
        "alt": "Fotografia real de Globos Nino o Nina en celeste y rosado",
        "categoria": "Baby Shower y Eventos",
        "subcategoria": "Baby Shower",
        "tematica": "Decoracion Nino o Nina para revelacion de genero",
        "presentacion": "Pack de globos Baby Shower",
        "precio": 15.0,
        "stock": 72,
        "descripcion": "Globos tematicos Nino o Nina en celeste y rosado para decorar la entrada y mesa principal.",
        "fichaTecnica": "Ideal para combinar con balon revelador y spray de color.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ADtZ1_qtICG8n99qHBkZYXY/CS-60.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-61",
        "sku": "CS-BE-61",
        "orden": 61,
        "nombre": "Globos Es un Nino o Nina",
        "alt": "Fotografia real de Globos Es un Nino o Nina para bienvenida de bebe",
        "categoria": "Baby Shower y Eventos",
        "subcategoria": "Baby Shower",
        "tematica": "Mensaje Es un Nino o Es una Nina para baby shower",
        "presentacion": "Set de globos metalicos de bienvenida",
        "precio": 15.0,
        "stock": 70,
        "descripcion": "Globos festivos con mensaje Es un Nino o Es una Nina para baby showers y bienvenida del bebe.",
        "fichaTecnica": "Disponibles en celeste tierno y rosado dulce. Valvula autosellante de larga duracion.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/ABSLLPFiUAEmeL6DN0H-ugk/CS-61.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-62",
        "sku": "CS-BE-62",
        "orden": 62,
        "nombre": "Globos Minnie y Mickey Bebe",
        "alt": "Fotografia real de Globos Minnie y Mickey Bebe para Baby Shower",
        "categoria": "Baby Shower y Eventos",
        "subcategoria": "Baby Shower",
        "tematica": "Personajes Minnie Bebe y Mickey Bebe en tonos pastel",
        "presentacion": "Set de globos metalicos de personaje bebe",
        "precio": 20.0,
        "stock": 58,
        "descripcion": "Tiernos globos metalicos de Minnie y Mickey Bebe ideales para baby showers y primer anito.",
        "fichaTecnica": "Acabado brillante y dulce. Indica si deseas edicion Minnie Bebe, Mickey Bebe o ambos.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AHcmXgu4f4I59IKvYyzrPm0/CS-62.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-63",
        "sku": "CS-BE-63",
        "orden": 63,
        "nombre": "Kit Cumpleanos Basico Velas, Vasos y Platillos",
        "alt": "Fotografia real de Kit Cumpleanos Basico con velas, vasos y platillos",
        "categoria": "Baby Shower y Eventos",
        "subcategoria": "Kits y Vestidos",
        "tematica": "Kit completo de mesa con velas, vasos y platillos",
        "presentacion": "Combo practico de 3 productos coordinados",
        "precio": 26.0,
        "stock": 50,
        "descripcion": "Kit basico de cumpleanos que incluye velas de numeros, vasos variados y platillos tematicos.",
        "fichaTecnica": "Solucion rapida y economica lista para festejar. Puedes elegir colores o caricaturas al confirmar.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AAe4x9ugNj61U2CNbJqVZK8/CS-01.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    },
    {
        "id": "CS-64",
        "sku": "CS-BE-64",
        "orden": 64,
        "nombre": "Combo Decoracion Fiesta Cortina, Globo y Banderin",
        "alt": "Fotografia real de Combo Decoracion Fiesta con cortina, globo y banderin",
        "categoria": "Baby Shower y Eventos",
        "subcategoria": "Kits y Vestidos",
        "tematica": "Combo completo de pared con cortina, globos y banderin",
        "presentacion": "Combo decorativo de 3 elementos festivos",
        "precio": 32.0,
        "stock": 45,
        "descripcion": "Combo decoracion de fiesta con cortina metalizada, globos de celebracion y banderin Feliz Cumpleanos.",
        "fichaTecnica": "Arma el fondo de fotos completo en minutos con paleta coordinada para cumpleanos o eventos.",
        "portada": "https://www.dropbox.com/scl/fo/fm6ph3qmeqhteeaerss32/AC12o7HGbOd9euTkHhbfFTE/CS-37.jpeg?rlkey=3veddcklbnn2g597gwc80hlnj&raw=1"
    }
];

// Semana 2 - Fetch Lazy Loading y Bubbling
function abrirLightboxImagen(srcImagen, tituloImagen) {
    if (!srcImagen) return;
    const visorLightbox = document.getElementById('lightboxImagenVisor');
    const fotoAmpliada = document.getElementById('lightboxImagenFoto');
    const etiquetaTitulo = document.getElementById('lightboxImagenTitulo');
    if (!visorLightbox || !fotoAmpliada) return;
    fotoAmpliada.setAttribute('src', srcImagen);
    fotoAmpliada.setAttribute('alt', tituloImagen || 'Vista ampliada');
    if (etiquetaTitulo) etiquetaTitulo.textContent = tituloImagen || '';
    visorLightbox.classList.add('activo');
}

function cerrarLightboxImagen() {
    const visorLightbox = document.getElementById('lightboxImagenVisor');
    if (visorLightbox) visorLightbox.classList.remove('activo');
}

function esVistaMovilVertical() {
    return window.matchMedia('(max-width: 767px)').matches;
}

function abrirDrawerMovil() {
    const drawer = document.getElementById('drawerMenuMovil');
    const backdrop = document.getElementById('drawerBackdrop');
    const burguer = document.getElementById('burguerBtn');
    if (!drawer || !backdrop) return;
    drawer.inert = false;
    drawer.setAttribute('aria-hidden', 'false');
    drawer.classList.add('drawer-movil--abierto');
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('drawer-backdrop--abierto');
    document.body.classList.add('drawer-abierto');
    if (burguer) burguer.setAttribute('aria-expanded', 'true');
}

function cerrarDrawerMovil() {
    const drawer = document.getElementById('drawerMenuMovil');
    const backdrop = document.getElementById('drawerBackdrop');
    const burguer = document.getElementById('burguerBtn');
    if (drawer) {
        drawer.classList.remove('drawer-movil--abierto');
        drawer.setAttribute('aria-hidden', 'true');
        drawer.inert = true;
    }
    if (backdrop) {
        backdrop.classList.remove('drawer-backdrop--abierto');
        backdrop.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('drawer-abierto');
    if (burguer && esVistaMovilVertical()) {
        burguer.setAttribute('aria-expanded', 'false');
    }
}

document.addEventListener('click', (eventoClick) => {
    const imagenTocada = eventoClick.target.closest('img');
    if (
        imagenTocada &&
        !imagenTocada.closest('#lightboxImagenVisor') &&
        !imagenTocada.closest('#sugerenciasBuscador') &&
        !imagenTocada.closest('.card-item__media') &&
        imagenTocada.getAttribute('src')
    ) {
        const origenFoto = imagenTocada.getAttribute('src');
        const textoFoto = imagenTocada.getAttribute('alt') || imagenTocada.closest('article')?.querySelector('h3, h2')?.textContent || '';
        abrirLightboxImagen(origenFoto, textoFoto);
    }
});

document.addEventListener('keydown', (eventoTecla) => {
    if (eventoTecla.key === 'Escape') {
        cerrarLightboxImagen();
        cerrarDrawerMovil();
        const btnCerrarCar = document.getElementById('btnCerrarCarrito');
        const panelCar = document.getElementById('panelCarritoDrawer');
        if (btnCerrarCar && panelCar && !panelCar.hidden) btnCerrarCar.click();
        const sugerencias = document.getElementById('sugerenciasBuscador');
        if (sugerencias) sugerencias.hidden = true;
        const btnLupa = document.getElementById('btnLupa');
        if (btnLupa) btnLupa.setAttribute('aria-expanded', 'false');
    }
});

// Semana 3 - DOMPurify
function renderizarDetalleSeguro(contenedorSelector, htmlDesdeServidor) {
    const htmlSanitizado = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(htmlDesdeServidor) : '';
    const nodo = document.querySelector(contenedorSelector);
    if (!nodo) return;
    if (htmlSanitizado) {
        nodo.innerHTML = htmlSanitizado;
    } else {
        nodo.textContent = String(htmlDesdeServidor || '');
    }
}

// Semana 2 - Arquitectura PWA Offline
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

let eventoInstalacionDiferido = null;
window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    eventoInstalacionDiferido = evento;
    const btnInstalar = document.getElementById('btnInstalarPWA');
    if (btnInstalar) btnInstalar.hidden = false;
});

$(document).ready(function () {
    const api = window.SupabaseAPI;
    const CLAVE_TEMA = 'tema_' + api.PROYECTO_ACTUAL;
    const CLAVE_CARRITO = 'carrito_' + api.PROYECTO_ACTUAL;
    const TASA_IMPUESTO = 0.13;

    let sesionActiva = api.obtenerSesion();
    let catalogoBase = [];
    let productosExtraRemotos = [];
    let catalogoPrincipal = [];
    let catalogoCompleto = [];
    let carrito = cargarCarritoLocal();
    let categoriaActiva = 'todos';
    let subcategoriaActiva = '';
    let terminoBusqueda = '';
    let productoResaltadoId = '';
    let pedidoEnEdicionId = null;
    const PROMO_TITULO_DEFECTO = 'Combo Cumpleanos Velas + Globos';
    const PROMO_DESC_PUBLICA = 'Descuento especial por tiempo limitado disponible para todo publico.';
    const PROMO_PRECIO_DEFECTO = 25;
    const UMBRAL_EVERGREEN_MS = 180 * 24 * 60 * 60 * 1000;
    let promoActual = null;
    let promoExpiracionNotificada = false;
    let promoReclamos = 0;
    let imagenDataUrlCargada = '';
    let temporizadorCheckout = null;
    const DURACION_CHECKOUT_SEG = 300;
    let segundosCheckout = DURACION_CHECKOUT_SEG;
    let temporizadorBuscador = null;

    // Semana 3 - Validacion Estricta en Tiempo Real y Blacklist de Groserias
    const BLACKLIST_GROSERIAS = [
        'puta', 'puto', 'mierda', 'carajo', 'verga', 'pene', 'vagina',
        'cojudo', 'cojuda', 'pelotudo', 'pelotuda', 'imbecil', 'idiota',
        'estupido', 'estupida', 'maricon', 'marica', 'cabron', 'pendejo',
        'pendeja', 'chinga', 'joder', 'culero', 'malparido', 'hijueputa',
        'concha', 'csm', 'ctm', 'ptm', 'hdpta'
    ];

    const PALABRAS_SEGURAS_FILTRO = [
        'computadora', 'computador', 'disputa', 'reputacion', 'diputado',
        'diputada', 'imputar', 'amputar', 'escuchar', 'conchita'
    ];

    const ABREVIATURAS_SIN_VOCAL = new Set([
        'qr', 'bs', 'sr', 'dr', 'km', 'cm', 'mm', 'ml',
        'gr', 'kg', 'cs', 'tv', 'dj', 'sm', 'xl', 'xs'
    ]);

    const PALABRAS_DOBLE_SILABA_VALIDAS = new Set([
        'mama', 'papa', 'bebe', 'pepe', 'coco', 'nene',
        'lulu', 'tutu', 'nana', 'mimi', 'tata', 'kiki'
    ]);

    const PATRONES_TECLAZO = [
        'asdf', 'sdfg', 'dfgh', 'fghj', 'ghjk', 'hjkl', 'qwer', 'wert',
        'erty', 'zxcv', 'xcvb', 'cvbn', 'dwad', 'awda', 'wadw', 'sdwa',
        'adwa', 'asda', 'dsad', 'sadw', 'wdwa', 'jdsj', 'dsjk', 'lkjh',
        'poiu', 'mnbv', 'wasd', 'fesf', 'awra'
    ];

    const BIGRAMAS_TECLAZO = [
        'dw', 'wd', 'wr', 'jk', 'jd', 'kj', 'dk', 'kd', 'fj', 'jf',
        'fg', 'gf', 'hg', 'hj', 'jh', 'zx', 'xz', 'cv', 'vc',
        'vb', 'bv', 'qw', 'wq', 'wx', 'xw'
    ];

    function normalizarTextoFiltro(texto) {
        return String(texto || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[@4]/g, 'a')
            .replace(/[3]/g, 'e')
            .replace(/[1!]/g, 'i')
            .replace(/[0]/g, 'o')
            .replace(/[$5]/g, 's')
            .replace(/[^a-z\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function contieneGroserias(texto) {
        let normalizado = normalizarTextoFiltro(texto);
        if (!normalizado) return false;
        PALABRAS_SEGURAS_FILTRO.forEach((segura) => {
            normalizado = normalizado.replace(new RegExp('\\b' + segura + 's?\\b', 'g'), ' ');
        });
        normalizado = normalizado.replace(/\s+/g, ' ').trim();
        if (!normalizado) return false;

        const palabras = normalizado.split(' ');
        const colapsado2 = normalizado.replace(/(.)\1{2,}/g, '$1');
        const colapsado1 = normalizado.replace(/(.)\1+/g, '$1');
        const palabrasColapsadas = colapsado2.split(' ').concat(colapsado1.split(' '));
        const conjunto = new Set(palabras.concat(palabrasColapsadas));
        const compacto = colapsado2.replace(/\s+/g, '');

        for (let i = 0; i < BLACKLIST_GROSERIAS.length; i += 1) {
            const mala = BLACKLIST_GROSERIAS[i];
            if (conjunto.has(mala) || conjunto.has(mala + 's') || conjunto.has(mala + 'es')) {
                return true;
            }
            if (mala.length >= 4 && compacto.indexOf(mala) !== -1) {
                return true;
            }
        }
        return false;
    }

    function tieneConsonantesExcesivas(cadenaLetras) {
        const saneada = cadenaLetras.replace(/nstr|nscr|bstr|xtr|lstr/g, 'str');
        return /[bcdfghjklmnpqrstvwxz]{4,}/i.test(saneada);
    }

    function tieneSilabaRepetidaBasura(palabra) {
        if (/(.)\1{2,}/i.test(palabra)) return true;
        if (/([a-z]{3,4})\1+/i.test(palabra)) return true;
        if (/([a-z]{2})\1{2,}/i.test(palabra)) return true;
        if (/^([a-z]{2})\1$/i.test(palabra) && !PALABRAS_DOBLE_SILABA_VALIDAS.has(palabra)) {
            return true;
        }
        return false;
    }

    function esPalabraBasura(palabra) {
        const w = String(palabra || '').toLowerCase();
        if (!w) return false;
        if (tieneSilabaRepetidaBasura(w)) return true;
        if (w.length >= 2 && !/[aeiou]/.test(w)) {
            if (!ABREVIATURAS_SIN_VOCAL.has(w)) return true;
        }
        if (tieneConsonantesExcesivas(w)) return true;
        if ((w.match(/w/g) || []).length >= 2) return true;
        for (let i = 0; i < PATRONES_TECLAZO.length; i += 1) {
            if (w.indexOf(PATRONES_TECLAZO[i]) !== -1) return true;
        }
        if (w.length >= 4) {
            for (let j = 0; j < BIGRAMAS_TECLAZO.length; j += 1) {
                if (w.indexOf(BIGRAMAS_TECLAZO[j]) !== -1) return true;
            }
        }
        if (w.length >= 5) {
            const voc = (w.match(/[aeiou]/g) || []).length;
            if (voc / w.length < 0.2) return true;
            if (voc <= 1 && /[bcdfghjklmnpqrstvwxz]{2}.*[bcdfghjklmnpqrstvwxz]{2}/.test(w)) {
                return true;
            }
        }
        return false;
    }

    function esTeclazoSinSentido(texto) {
        const limpio = String(texto || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        if (/(.)\1{2,}/i.test(limpio)) return true;
        const soloLetrasEspacios = limpio.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!soloLetrasEspacios) return true;
        const sinEspacios = soloLetrasEspacios.replace(/\s+/g, '');
        if (/([a-z]{3,4})\1+/i.test(sinEspacios)) return true;
        if (sinEspacios.length >= 5) {
            const vocalesTotales = (sinEspacios.match(/[aeiou]/g) || []).length;
            if (vocalesTotales / sinEspacios.length < 0.2) return true;
        }
        const palabras = soloLetrasEspacios.split(' ').filter(Boolean);
        for (let i = 0; i < palabras.length; i += 1) {
            if (esPalabraBasura(palabras[i])) {
                return true;
            }
        }
        return false;
    }

    function validarTextoEnVivo(valor, tipo) {
        const limpio = String(valor || '').trim();
        if (contieneGroserias(limpio)) {
            return { valido: false, error: 'Lenguaje no permitido. Por favor escribe de forma respetuosa.' };
        }
        if (tipo === 'nombre') {
            const regexNombre = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]{3,45}$/;
            const palabras = limpio.split(/\s+/).filter(Boolean);
            const soloLetras = limpio.replace(/\s+/g, '').toLowerCase();
            const unicos = new Set(soloLetras.split('')).size;
            const longitudesValidas = palabras.length > 0 && palabras.every((w, idx) => {
                if (w.length >= 2) return true;
                return palabras.length >= 3 && idx > 0 && idx < palabras.length - 1 && (w.toLowerCase() === 'y' || w.toLowerCase() === 'e');
            });
            if (
                !regexNombre.test(limpio) ||
                !longitudesValidas ||
                !/[aeiouáéíóúü]/i.test(limpio) ||
                esTeclazoSinSentido(limpio) ||
                (soloLetras.length >= 5 && unicos <= 2)
            ) {
                return { valido: false, error: 'Ingresa un nombre real valido (solo letras, minimo 3 caracteres).' };
            }
            return { valido: true, error: '' };
        }
        if (tipo === 'mensaje') {
            const normal = limpio.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const palabrasValidas = normal
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter((w) => {
                    if (!w) return false;
                    if (/^[0-9]+$/.test(w)) return true;
                    const soloL = w.replace(/[^a-z]/g, '');
                    if (!soloL) return false;
                    if (soloL.length === 1) return soloL === 'a' || soloL === 'y' || soloL === 'o' || soloL === 'e';
                    return !esPalabraBasura(soloL);
                });
            const palabrasConLetras = normal
                .replace(/[^a-z\s]/g, ' ')
                .split(/\s+/)
                .filter((w) => w.length >= 2 && !esPalabraBasura(w));
            const vocales = (limpio.match(/[aeiouáéíóúü]/gi) || []).length;
            if (
                limpio.length < 10 ||
                vocales < 3 ||
                palabrasValidas.length < 2 ||
                palabrasConLetras.length < 2 ||
                esTeclazoSinSentido(limpio)
            ) {
                return { valido: false, error: 'Escribe un mensaje claro y real (minimo 2 palabras coherentes).' };
            }
            return { valido: true, error: '' };
        }
        if (tipo === 'lista') {
            const soloAlfanum = limpio.replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/g, '');
            const letras = (limpio.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
            if (
                limpio.length < 3 ||
                soloAlfanum.length < 3 ||
                letras < 2 ||
                esTeclazoSinSentido(limpio)
            ) {
                return { valido: false, error: 'Escribe un articulo, color o tematica valida.' };
            }
            return { valido: true, error: '' };
        }
        if (tipo === 'referencia' || tipo === 'texto_corto') {
            const soloAlfanum = limpio.replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/g, '');
            const letras = (limpio.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
            const digitos = (limpio.match(/[0-9]/g) || []).length;
            const soloDigitosRepetidos = digitos >= 3 && letras === 0 && /^(\d)\1{2,}$/.test(soloAlfanum);
            if (limpio.length < 3 || soloAlfanum.length < 3 || soloDigitosRepetidos) {
                return { valido: false, error: 'Ingresa un numero de comprobante o referencia valida.' };
            }
            if (letras > 0) {
                if (/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])\1{2,}/i.test(limpio)) {
                    return { valido: false, error: 'Ingresa una referencia valida sin caracteres repetidos.' };
                }
                if (digitos === 0 && esTeclazoSinSentido(limpio)) {
                    return { valido: false, error: 'Ingresa una referencia valida sin teclazos aleatorios.' };
                }
                if (digitos > 0 && letras >= 3 && esTeclazoSinSentido(limpio)) {
                    return { valido: false, error: 'Ingresa una referencia bancaria o QR valida.' };
                }
            }
            return { valido: true, error: '' };
        }
        if (tipo === 'usuario') {
            const regexUsuario = /^[a-zA-Z0-9._-]{4,25}$/;
            if (!regexUsuario.test(limpio)) {
                return { valido: false, error: 'Ingresa un usuario valido (4 a 25 caracteres alfanumericos sin espacios).' };
            }
            return { valido: true, error: '' };
        }
        return { valido: true, error: '' };
    }

    function validarEntradaTexto(valor, tipo) {
        return validarTextoEnVivo(valor, tipo);
    }

    function obtenerSpanErrorCampo($campo) {
        if (!$campo || !$campo.length) return $();
        const idCampo = $campo.attr('id') || '';
        if (idCampo === 'buscadorProductos') {
            const $panel = $campo.closest('#panelBuscadorSuperior');
            let $spanBusc = $panel.children('.error-tiempo-real');
            if (!$spanBusc.length) {
                $spanBusc = $('<span>').attr({ id: 'errorBuscadorTiempoReal', 'aria-live': 'polite' }).addClass('error-tiempo-real');
                $panel.children('.buscador-superior__barra').after($spanBusc);
            }
            return $spanBusc;
        }
        const $grupo = $campo.closest('.campo-grupo');
        if ($grupo.length) {
            let $span = $grupo.children('.error-tiempo-real');
            if (!$span.length) {
                $span = $('<span>').addClass('error-tiempo-real').attr('aria-live', 'polite');
                $grupo.append($span);
            }
            return $span;
        }
        let $sig = $campo.next('.error-tiempo-real');
        if (!$sig.length) {
            $sig = $('<span>').addClass('error-tiempo-real').attr('aria-live', 'polite');
            $campo.after($sig);
        }
        return $sig;
    }

    function inyectarSpansErrorTiempoReal() {
        const selectores = [
            '#buscadorProductos',
            '#consultaMensaje',
            '#checkoutNombreCliente',
            '#checkoutNotasEntrega',
            '#inputRefPago',
            '#inputMontoEfectivo',
            '#userTikTok',
            '#clienteNombre',
            '#inputCancion',
            '#regNombreCompleto',
            '#regUsuario',
            '#regClave',
            '#loginUsuario',
            '#loginClave'
        ];
        selectores.forEach((sel) => {
            const $c = $(sel);
            if ($c.length) obtenerSpanErrorCampo($c);
        });
    }

    function mostrarErrorCampo($campo, mensaje, enfocar) {
        if (!$campo || !$campo.length) return;
        const esTextarea = $campo.is('textarea');
        $campo
            .removeClass('campo-valido')
            .addClass('campo-invalido ' + (esTextarea ? 'control-textarea--invalido' : 'control-input--invalido'))
            .attr('aria-invalid', 'true');
        obtenerSpanErrorCampo($campo).text(mensaje);
        if (enfocar !== false) {
            $campo.trigger('focus');
        }
    }

    function marcarCampoValido($campo) {
        if (!$campo || !$campo.length) return;
        $campo
            .removeClass('campo-invalido control-input--invalido control-textarea--invalido')
            .addClass('campo-valido')
            .removeAttr('aria-invalid');
        obtenerSpanErrorCampo($campo).text('');
    }

    function limpiarErrorCampo($campo) {
        if (!$campo || !$campo.length) return;
        $campo
            .removeClass('campo-invalido campo-valido control-input--invalido control-textarea--invalido')
            .removeAttr('aria-invalid');
        obtenerSpanErrorCampo($campo).text('');
    }

    function actualizarEstadoBotonFormulario(clave) {
        if (clave === 'consulta') {
            const v = String($('#consultaMensaje').val() || '').trim();
            const ok = Boolean(v) && validarTextoEnVivo(v, 'mensaje').valido;
            $('#formConsultaCliente button[type="submit"]').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'combo') {
            const v = String($('#userTikTok').val() || '').trim();
            const ok = Boolean(v) && validarTextoEnVivo(v, 'mensaje').valido;
            $('#orderForm button[type="submit"]').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'reserva') {
            const v = String($('#clienteNombre').val() || '').trim();
            const ok = Boolean(v) && validarTextoEnVivo(v, 'nombre').valido;
            $('#formReserva button[type="submit"]').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'lista') {
            const v = String($('#inputCancion').val() || '').trim();
            const ok = Boolean(v) && validarTextoEnVivo(v, 'lista').valido;
            $('#btnPedir').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'registro') {
            const n = String($('#regNombreCompleto').val() || '').trim();
            const u = String($('#regUsuario').val() || '').trim();
            const c = String($('#regClave').val() || '').trim();
            const ok = Boolean(n && u) && validarTextoEnVivo(n, 'nombre').valido && validarTextoEnVivo(u, 'usuario').valido && c.length >= 6;
            $('#formRegistroCliente button[type="submit"]').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'login') {
            const u = String($('#loginUsuario').val() || '').trim();
            const c = String($('#loginClave').val() || '').trim();
            const ok = Boolean(u) && validarTextoEnVivo(u, 'usuario').valido && c.length >= 4;
            $('#formLogin button[type="submit"]').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'checkout') {
            let ok = true;
            const pideNombre = !$('#grupoCheckoutNombreCliente').prop('hidden');
            if (pideNombre) {
                const nom = String($('#checkoutNombreCliente').val() || '').trim();
                if (!nom || !validarTextoEnVivo(nom, 'nombre').valido) ok = false;
            }
            const notas = String($('#checkoutNotasEntrega').val() || '').trim();
            if (notas && !validarTextoEnVivo(notas, 'mensaje').valido) ok = false;
            const $ref = $('#inputRefPago');
            if ($ref.length) {
                const refVal = String($ref.val() || '').trim();
                if (refVal && !validarTextoEnVivo(refVal, 'referencia').valido) ok = false;
            }
            const forma = String($('#checkoutPago').val() || 'Pago por QR');
            if (forma === 'Efectivo Contra Entrega') {
                const $ef = $('#inputMontoEfectivo');
                if ($ef.length) {
                    const crudo = String($ef.val() || '').trim();
                    if (crudo) {
                        const monto = Number(crudo);
                        const tot = calcularTotalCheckoutActual();
                        if (!Number.isFinite(monto) || monto + 0.001 < tot) ok = false;
                    }
                }
            }
            $('#btnSubmitCheckout').prop('disabled', !ok);
            return ok;
        }
        return true;
    }

    function aplicarValidacionTiempoReal($campo, tipo, claveForm, opciones) {
        const valor = String($campo.val() || '').trim();
        if (!valor) {
            limpiarErrorCampo($campo);
            actualizarEstadoBotonFormulario(claveForm);
            return Boolean(opciones && opciones.opcional);
        }
        const res = validarTextoEnVivo(valor, tipo);
        if (!res.valido) {
            mostrarErrorCampo($campo, res.error, false);
            actualizarEstadoBotonFormulario(claveForm);
            return false;
        }
        marcarCampoValido($campo);
        actualizarEstadoBotonFormulario(claveForm);
        return true;
    }

    function conectarValidacionTiempoReal(selector, tipo, claveForm, opciones) {
        $(document).on('input blur', selector, function () {
            aplicarValidacionTiempoReal($(this), tipo, claveForm, opciones);
        });
    }

    inyectarSpansErrorTiempoReal();
    conectarValidacionTiempoReal('#consultaMensaje', 'mensaje', 'consulta');
    conectarValidacionTiempoReal('#checkoutNombreCliente', 'nombre', 'checkout');
    conectarValidacionTiempoReal('#checkoutNotasEntrega', 'mensaje', 'checkout', { opcional: true });
    conectarValidacionTiempoReal('#inputRefPago', 'referencia', 'checkout', { opcional: true });
    conectarValidacionTiempoReal('#userTikTok', 'mensaje', 'combo');
    conectarValidacionTiempoReal('#clienteNombre', 'nombre', 'reserva');
    conectarValidacionTiempoReal('#inputCancion', 'lista', 'lista');
    conectarValidacionTiempoReal('#regNombreCompleto', 'nombre', 'registro');
    conectarValidacionTiempoReal('#regUsuario', 'usuario', 'registro');
    conectarValidacionTiempoReal('#loginUsuario', 'usuario', 'login');

    $(document).on('input blur', '#regClave', function () {
        const $c = $(this);
        const v = String($c.val() || '').trim();
        if (!v) {
            limpiarErrorCampo($c);
        } else if (v.length < 6) {
            mostrarErrorCampo($c, 'La clave debe tener al menos 6 caracteres.', false);
        } else {
            marcarCampoValido($c);
        }
        actualizarEstadoBotonFormulario('registro');
    });

    $(document).on('input blur', '#loginClave', function () {
        const $c = $(this);
        const v = String($c.val() || '').trim();
        if (!v) {
            limpiarErrorCampo($c);
        } else if (v.length < 4) {
            mostrarErrorCampo($c, 'Ingresa tu clave de acceso (minimo 4 caracteres).', false);
        } else {
            marcarCampoValido($c);
        }
        actualizarEstadoBotonFormulario('login');
    });

    ['consulta', 'combo', 'reserva', 'lista', 'registro', 'login'].forEach(actualizarEstadoBotonFormulario);

    function cargarCarritoLocal() {
        try {
            const raw = localStorage.getItem(CLAVE_CARRITO);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (err) {
            return [];
        }
    }

    function guardarCarritoLocal() {
        try {
            localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito));
        } catch (err) {
        }
    }

    function registrarBitacoraDom(tipo, detalle) {
        const lista = document.getElementById('listaBitacoraDom');
        if (!lista) return;
        const li = document.createElement('li');
        li.textContent = '[' + new Date().toLocaleTimeString() + '] ' + tipo + ': ' + detalle;
        lista.prepend(li);
        while (lista.children.length > 120) {
            lista.removeChild(lista.lastChild);
        }
    }

    // Semana 2 - Calculador Modal 30s y Toast
    function mostrarToast(mensaje, variante) {
        const $cont = $('#contenedorToasts');
        const clase = variante ? 'alerta-toast--' + variante : '';
        const $toast = $('<div>').addClass('alerta-toast ' + clase).text(mensaje).hide();
        $cont.append($toast);
        $toast.slideDown(180).delay(2800).fadeOut(280, function () {
            $(this).remove();
        });
    }

    function construirUrlComprobanteWhatsapp(pedidoInfo) {
        const codigo = pedidoInfo && pedidoInfo.id ? ('#' + pedidoInfo.id) : 'Pendiente de asignacion';
        const cliente = String((pedidoInfo && pedidoInfo.cliente) || sesionActiva.usuario || 'Invitado').trim();
        const itemsLista = Array.isArray(pedidoInfo && pedidoInfo.items) && pedidoInfo.items.length > 0
            ? pedidoInfo.items.map((it) => (it.nombre || 'Producto') + ' x' + Math.max(1, Number(it.cantidad || 1))).join(', ')
            : 'Detalle registrado en tienda';
        const total = Number((pedidoInfo && pedidoInfo.total) || 0).toFixed(2);
        const modalidad = String((pedidoInfo && pedidoInfo.modalidad) || 'Envio a Domicilio');
        const formaPago = String((pedidoInfo && pedidoInfo.formaPago) || 'Pago por QR');
        const texto = [
            'Hola ' + CONFIG_PAGO_NEGOCIO.tienda + ', envio mi comprobante y detalle de pedido:',
            'Codigo: ' + codigo,
            'Cliente: ' + cliente,
            'Productos: ' + itemsLista,
            'Entrega: ' + modalidad,
            'Forma de pago: ' + formaPago,
            'Total: ' + CONFIG_NEGOCIO.moneda + ' ' + total
        ].join('\n');
        return 'https://wa.me/' + CONFIG_PAGO_NEGOCIO.whatsapp + '?text=' + encodeURIComponent(texto);
    }

    function crearBotonWhatsappComprobante(pedidoInfo) {
        const url = construirUrlComprobanteWhatsapp(pedidoInfo);
        const $enlace = $('<a>')
            .attr({
                href: url,
                target: '_blank',
                rel: 'noopener noreferrer',
                'aria-label': 'Enviar comprobante de pedido por WhatsApp a ' + CONFIG_PAGO_NEGOCIO.tienda
            })
            .addClass('btn-whatsapp-comprobante');
        const svgWa = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
        $enlace.append(svgWa, $('<span>').text('Enviar Comprobante por WhatsApp'));
        return $enlace;
    }

    function mostrarToastComprobanteWhatsapp(mensaje, variante, pedidoInfo) {
        const $cont = $('#contenedorToasts');
        const clase = variante ? 'alerta-toast--' + variante : '';
        const $toast = $('<div>').addClass('alerta-toast alerta-toast--accion ' + clase).hide();
        const $cab = $('<div>').addClass('alerta-toast__cabecera');
        const $texto = $('<span>').text(mensaje);
        const $btnCerrar = $('<button>')
            .attr({ type: 'button', 'aria-label': 'Cerrar notificacion' })
            .addClass('alerta-toast__cerrar')
            .text('X')
            .on('click', () => $toast.fadeOut(180, () => $toast.remove()));
        $cab.append($texto, $btnCerrar);
        $toast.append($cab, crearBotonWhatsappComprobante(pedidoInfo));
        $cont.append($toast);
        $toast.slideDown(180);
        setTimeout(() => {
            if ($toast.closest('body').length) {
                $toast.fadeOut(280, () => $toast.remove());
            }
        }, 9000);
    }

    function actualizarEstadoRedYAvisoOffline() {
        const enLinea = navigator.onLine;
        const badge = document.getElementById('estadoRed');
        if (badge) {
            badge.textContent = enLinea ? 'ONLINE' : 'OFFLINE';
            badge.classList.toggle('indicador-red--offline', !enLinea);
        }
        const badgeDrawer = document.getElementById('drawerEstadoRed');
        if (badgeDrawer) {
            badgeDrawer.textContent = enLinea ? 'ONLINE' : 'OFFLINE';
            badgeDrawer.classList.toggle('indicador-red--offline', !enLinea);
        }
        const cola = api.obtenerColaFIFO();
        const aviso = document.getElementById('avisoColaOffline');
        const texto = document.getElementById('textoAvisoOffline');
        const btnSync = document.getElementById('btnSincronizarColaGlobal');
        if (!aviso || !texto || !btnSync) return;

        if (!enLinea) {
            const n = cola.length;
            texto.textContent = n > 0
                ? 'Modo Offline activo: ' + n + (n === 1 ? ' operacion' : ' operaciones') + ' en cola FIFO. Se enviara automaticamente al recuperar conexion.'
                : 'Modo Offline activo: navegando desde cache local. Tus pedidos y consultas se encolaran en orden FIFO.';
            btnSync.hidden = true;
            aviso.hidden = false;
        } else if (cola.length > 0) {
            texto.textContent = 'Conexion recuperada: ' + cola.length + (cola.length === 1 ? ' operacion pendiente' : ' operaciones pendientes') + ' en cola FIFO.';
            btnSync.hidden = false;
            aviso.hidden = false;
        } else {
            aviso.hidden = true;
        }
    }

    function aplicarTema(tema) {
        const oscuro = tema === 'oscuro';
        document.body.classList.toggle('modo-oscuro', oscuro);
        document.body.classList.toggle('dark-mode', oscuro);
        document.body.classList.toggle('modo-claro', !oscuro);
        const textoDrawerTema = document.getElementById('drawerTemaTexto');
        if (textoDrawerTema) {
            textoDrawerTema.textContent = oscuro ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro';
        }
    }

    function alternarTema() {
        const nuevo = (document.body.classList.contains('modo-oscuro') || document.body.classList.contains('dark-mode')) ? 'claro' : 'oscuro';
        aplicarTema(nuevo);
        localStorage.setItem(CLAVE_TEMA, nuevo);
        registrarBitacoraDom('TEMA', 'Modo cambiado a ' + nuevo);
    }

    aplicarTema(localStorage.getItem(CLAVE_TEMA) || 'claro');
    $('#themeBtn').on('click', alternarTema);
    $('#btnDrawerTema').on('click', alternarTema);

    $('#btnInstalarPWA').on('click', async function () {
        if (!eventoInstalacionDiferido) return;
        eventoInstalacionDiferido.prompt();
        await eventoInstalacionDiferido.userChoice.catch(() => {});
        eventoInstalacionDiferido = null;
        this.hidden = true;
    });

    $('#btnCerrarLightbox').on('click', cerrarLightboxImagen);
    $('#lightboxImagenVisor').on('click', function (e) {
        if (e.target === this) cerrarLightboxImagen();
    });

    // Semana 1 - Menu Hamburguesa
    const mqMovil = window.matchMedia('(max-width: 767px)');
    function sincronizarEstadoMenuResponsivo() {
        const burguer = document.getElementById('burguerBtn');
        const dock = document.getElementById('dockAcciones');
        if (!burguer || !dock) return;
        if (mqMovil.matches) {
            dock.classList.remove('dock-acciones--colapsada');
            burguer.setAttribute('aria-controls', 'drawerMenuMovil');
            const drawer = document.getElementById('drawerMenuMovil');
            const abierto = drawer ? drawer.classList.contains('drawer-movil--abierto') : false;
            burguer.setAttribute('aria-expanded', String(abierto));
        } else {
            cerrarDrawerMovil();
            burguer.setAttribute('aria-controls', 'dockAcciones');
            burguer.setAttribute('aria-expanded', String(!dock.classList.contains('dock-acciones--colapsada')));
        }
    }

    cerrarDrawerMovil();
    sincronizarEstadoMenuResponsivo();
    if (typeof mqMovil.addEventListener === 'function') {
        mqMovil.addEventListener('change', sincronizarEstadoMenuResponsivo);
    }

    $('#burguerBtn').on('click', function () {
        if (esVistaMovilVertical()) {
            const drawer = document.getElementById('drawerMenuMovil');
            if (drawer && drawer.classList.contains('drawer-movil--abierto')) {
                cerrarDrawerMovil();
            } else {
                abrirDrawerMovil();
            }
            return;
        }
        const dock = document.getElementById('dockAcciones');
        if (!dock) return;
        const colapsado = dock.classList.toggle('dock-acciones--colapsada');
        this.setAttribute('aria-expanded', String(!colapsado));
    });

    $('#btnCerrarDrawer, #drawerBackdrop').on('click', cerrarDrawerMovil);
    $(document).on('click', '.drawer-movil__item[data-vista]', function () {
        mostrarVista(this.getAttribute('data-vista'));
        cerrarDrawerMovil();
    });
    $('#btnDrawerAcceso').on('click', function () {
        cerrarDrawerMovil();
        sincronizarUiSesionModal();
        $('#feedbackAcceso').prop('hidden', true);
        $('#modalAcceso').prop('hidden', false);
    });

    function puedeVerVista(idVista) {
        const panel = document.getElementById(idVista);
        if (!panel) return false;
        const req = panel.getAttribute('data-rol');
        if (!req) return true;
        const rol = api.normalizarRol(sesionActiva.rol);
        if (req === 'cliente') return rol === 'cliente';
        if (req === 'operativo') return rol === 'encargado' || rol === 'admin';
        if (req === 'admin') return rol === 'admin';
        return true;
    }

    function mostrarVista(idVista) {
        if (!puedeVerVista(idVista)) return;
        $('.vista-panel').each(function () {
            const ocultar = this.id !== idVista;
            this.hidden = ocultar;
            $(this).toggleClass('oculto', ocultar);
        });
        const vistaNavActiva = idVista === 'vistaDetalleProducto' ? 'vista-catalogo' : idVista;
        $('.dock-acciones__btn[data-vista]').removeClass('dock-acciones__btn--activo activo');
        $('.dock-acciones__btn[data-vista="' + vistaNavActiva + '"]').addClass('dock-acciones__btn--activo activo');
        $('.drawer-movil__item[data-vista]').removeClass('drawer-movil__item--activo activo');
        $('.drawer-movil__item[data-vista="' + vistaNavActiva + '"]').addClass('drawer-movil__item--activo activo');
        if (idVista === 'vistaMisPedidos') {
            cargarMisPedidosCliente();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function sincronizarUiSesionModal() {
        const rol = api.normalizarRol(sesionActiva.rol);
        const esAdmin = rol === 'admin';
        const etiquetaRol = esAdmin ? 'Admin' : (rol === 'encargado' ? 'Encargado' : 'Cliente');
        const tieneSesionActiva = Boolean(sesionActiva.autenticada === true && sesionActiva.usuario && sesionActiva.usuario !== 'Invitado');
        const nombreVisible = tieneSesionActiva ? sesionActiva.usuario : 'Invitado';

        $('#marcaNombreTexto').text(CONFIG_NEGOCIO.nombreMarca + ' | ' + nombreVisible);
        $('#drawerUsuarioActivo').text(nombreVisible);
        $('#resumenSesionModal').text('Sesion actual: ' + nombreVisible + ' (' + etiquetaRol + ')').prop('hidden', tieneSesionActiva);
        $('#bloqueFormulariosAcceso').prop('hidden', tieneSesionActiva);
        $('#perfilActivoUsuario').text(nombreVisible);
        $('#perfilActivoRol')
            .removeClass('badge-rol--cliente badge-rol--encargado badge-rol--admin')
            .addClass('badge-rol--' + rol)
            .text(etiquetaRol);
        $('#bloqueCerrarSesion, #btnCerrarSesion').prop('hidden', !tieneSesionActiva);

        if (!tieneSesionActiva) {
            const hayTabActiva = $('.btn-subtab.btn-subtab--activo[data-grupo="acceso"]').length > 0;
            if (!hayTabActiva) {
                $('.btn-subtab[data-grupo="acceso"]').removeClass('btn-subtab--activo');
                $('.btn-subtab[data-grupo="acceso"][data-subtab="subtab-login"]').addClass('btn-subtab--activo');
                $('#subtab-login').prop('hidden', false);
                $('#subtab-registro').prop('hidden', true);
            }
        }
    }

    function aplicarPermisosPorRol() {
        const rol = api.normalizarRol(sesionActiva.rol);
        const esCliente = rol === 'cliente';
        const esOperativo = rol === 'encargado' || rol === 'admin';
        const esAdmin = rol === 'admin';
        const etiquetaRol = esAdmin ? 'Admin' : (rol === 'encargado' ? 'Encargado' : 'Cliente');

        $('#badgeRolActivo')
            .removeClass('badge-rol--cliente badge-rol--encargado badge-rol--admin')
            .addClass('badge-rol--' + rol)
            .text(etiquetaRol);
        $('#drawerRolBadge')
            .removeClass('badge-rol--cliente badge-rol--encargado badge-rol--admin')
            .addClass('badge-rol--' + rol)
            .text(etiquetaRol);
        sincronizarUiSesionModal();
        const etiquetaModulo = document.getElementById('etiquetaModuloActivo');
        if (etiquetaModulo) {
            if (rol === 'cliente') {
                etiquetaModulo.hidden = true;
                etiquetaModulo.textContent = '';
            } else {
                etiquetaModulo.hidden = false;
                etiquetaModulo.textContent = esAdmin ? 'PANEL ADMINISTRADOR' : 'PANEL ENCARGADO DE TIENDA';
            }
        }

        $('[data-rol]').each(function () {
            const req = this.getAttribute('data-rol');
            if (req === 'cliente') {
                this.hidden = !esCliente;
            } else if (req === 'operativo') {
                this.hidden = !esOperativo;
            } else if (req === 'admin') {
                this.hidden = !esAdmin;
            }
        });

        const mostrarInvitacionCuenta = esCliente && !sesionActiva.autenticada;
        $('#invitacionCuentaPedidos, #invitacionCuentaCheckout').prop('hidden', !mostrarInvitacionCuenta);

        if (!esCliente) {
            cerrarBuscadorSuperior();
            cerrarCarrito(true);
            cerrarModalCheckout();
            mostrarVista(esAdmin ? 'vista-admin-control' : 'vista-op-pedidos');
        } else {
            mostrarVista('vista-catalogo');
        }

        promoExpiracionNotificada = false;
        pintarPromocionExpress();
        actualizarBarraPagoRapido();
        hidratarDatosSegunRol();
    }

    // Semana 2 - jQuery Acordeon y Temas
    $(document).on('click', '.accordion-btn', function () {
        const panel = this.nextElementSibling;
        if (!panel) return;
        panel.hidden = !panel.hidden;
    });

    $(document).on('click', '.btn-subtab', function () {
        const grupo = this.getAttribute('data-grupo');
        const destino = this.getAttribute('data-subtab');
        if (!grupo || !destino) return;
        $('.btn-subtab[data-grupo="' + grupo + '"]').removeClass('btn-subtab--activo');
        $(this).addClass('btn-subtab--activo');
        $('.panel-subtab[data-grupo="' + grupo + '"]').each(function () {
            this.hidden = this.id !== destino;
        });
    });

    $(document).on('click', '.dock-acciones__btn[data-vista]', function () {
        mostrarVista(this.getAttribute('data-vista'));
    });

    // Semana 3 - Buscador Google con Autocompletado
    function sincronizarBotonLimpiarBusqueda() {
        const valor = String($('#buscadorProductos').val() || '');
        $('#btnLimpiarBusqueda').prop('hidden', valor.trim().length === 0);
    }

    function abrirBuscadorSuperior() {
        const panel = document.getElementById('panelBuscadorSuperior');
        if (!panel) return;
        $('#btnLupa').attr('aria-expanded', 'true');
        $('#buscadorProductos').trigger('focus');
        renderizarSugerenciasBuscador($('#buscadorProductos').val(), true);
    }

    function cerrarBuscadorSuperior() {
        const sug = document.getElementById('sugerenciasBuscador');
        if (sug) sug.hidden = true;
        $('#btnLupa').attr('aria-expanded', 'false');
    }

    function renderizarSugerenciasBuscador(consulta, mostrarSugeridosIniciales) {
        const $sug = $('#sugerenciasBuscador').empty();
        const limpio = String(consulta || '').trim().toLowerCase();
        const $busc = $('#buscadorProductos');
        const $barra = $('.buscador-superior__barra');
        if (!limpio && !mostrarSugeridosIniciales) {
            $barra.removeClass('buscador-superior__barra--invalida');
            limpiarErrorCampo($busc);
            $sug.prop('hidden', true);
            return;
        }
        if (limpio && contieneGroserias(limpio)) {
            $barra.addClass('buscador-superior__barra--invalida');
            mostrarErrorCampo($busc, 'Lenguaje no permitido. Por favor escribe de forma respetuosa.', false);
            $sug.append($('<div>').addClass('sugerencia-vacia sugerencia-vacia--alerta').attr('role', 'alert').text('Lenguaje no permitido. Por favor escribe de forma respetuosa.'));
            $sug.prop('hidden', false);
            return;
        }
        $barra.removeClass('buscador-superior__barra--invalida');
        limpiarErrorCampo($busc);
        const coincidencias = limpio
            ? catalogoPrincipal
                .filter((item) => {
                    const bolsa = (item.nombre + ' ' + item.id + ' ' + item.categoria + ' ' + (item.subcategoria || '') + ' ' + (item.tematica || '') + ' ' + (item.descripcion || '')).toLowerCase();
                    return bolsa.indexOf(limpio) !== -1;
                })
                .slice(0, 8)
            : catalogoPrincipal.slice(0, 8);

        if (coincidencias.length === 0) {
            $sug.append($('<div>').addClass('sugerencia-vacia').text('No hay coincidencias para "' + String(consulta || '').trim() + '".'));
            $sug.prop('hidden', false);
            return;
        }

        coincidencias.forEach((item) => {
            const $opcion = $('<button>')
                .attr({ type: 'button', role: 'option', 'data-id': item.id })
                .addClass('sugerencia-item');
            const $thumb = $('<img>')
                .addClass('sugerencia-item__img')
                .attr('src', item.portada)
                .attr('alt', item.alt || ('Miniatura de ' + item.nombre))
                .attr('loading', 'lazy');
            const $info = $('<div>').addClass('sugerencia-item__info')
                .append($('<strong>').addClass('sugerencia-item__nombre').text(item.nombre))
                .append($('<span>').addClass('sugerencia-item__cat').text(item.categoria.toUpperCase() + (item.subcategoria ? (' | ' + item.subcategoria) : '')));
            const $precio = $('<strong>').addClass('sugerencia-item__precio').text(CONFIG_NEGOCIO.moneda + ' ' + Number(item.precio).toFixed(2));
            $opcion.append($thumb, $info, $precio);
            $sug.append($opcion);
        });
        $sug.prop('hidden', false);
    }

    $('#btnLupa').on('click', function () {
        abrirBuscadorSuperior();
    });

    $('#btnLimpiarBusqueda').on('click', function () {
        clearTimeout(temporizadorBuscador);
        $('#buscadorProductos').val('');
        terminoBusqueda = '';
        productoResaltadoId = '';
        sincronizarBotonLimpiarBusqueda();
        renderizarTarjetasCatalogo();
        $('#buscadorProductos').trigger('focus');
        renderizarSugerenciasBuscador('', true);
    });

    $('#buscadorProductos').on('focus click', function () {
        sincronizarBotonLimpiarBusqueda();
        renderizarSugerenciasBuscador($(this).val(), true);
    });

    $('#buscadorProductos').on('input', function () {
        terminoBusqueda = $(this).val();
        productoResaltadoId = '';
        sincronizarBotonLimpiarBusqueda();
        renderizarSugerenciasBuscador(terminoBusqueda, true);
        if ($('#vista-catalogo').prop('hidden')) {
            mostrarVista('vista-catalogo');
        }
        renderizarTarjetasCatalogo();
        clearTimeout(temporizadorBuscador);
        const limpio = String(terminoBusqueda || '').trim();
        if (limpio && !contieneGroserias(limpio)) {
            temporizadorBuscador = setTimeout(() => {
                registrarBitacoraDom('BUSQUEDA', 'Termino: "' + limpio + '"');
            }, 700);
        }
    });

    $('#sugerenciasBuscador').on('click', '.sugerencia-item', function () {
        const idElegido = this.getAttribute('data-id');
        const prod = catalogoCompleto.find((x) => String(x.id) === String(idElegido));
        if (!prod) return;
        cerrarBuscadorSuperior();
        abrirDetalleProducto(prod.id);
    });

    $(document).on('click', function (e) {
        if (!$(e.target).closest('#panelBuscadorSuperior').length) {
            const sug = document.getElementById('sugerenciasBuscador');
            if (sug && !sug.hidden) sug.hidden = true;
            $('#btnLupa').attr('aria-expanded', 'false');
        }
    });

    // Semana 3 - Componentes Encapsulados
    function obtenerCantidadEnCarrito(id) {
        const encontrado = carrito.find((x) => String(x.id) === String(id));
        return encontrado ? Number(encontrado.cantidad || 0) : 0;
    }

    function construirControlCantidadTarjeta(id) {
        const cantidad = obtenerCantidadEnCarrito(id);
        if (cantidad > 0) {
            const $stepper = $('<div>').addClass('stepper-inline').attr('data-id', id);
            const $btnRestar = $('<button>')
                .attr({ type: 'button', 'aria-label': 'Restar unidad', 'data-id': id })
                .addClass('stepper-inline__btn btn-stepper-restar')
                .text('-');
            const $valor = $('<span>').addClass('stepper-inline__valor').attr('aria-live', 'polite').text(cantidad);
            const $btnSumar = $('<button>')
                .attr({ type: 'button', 'aria-label': 'Sumar unidad', 'data-id': id })
                .addClass('stepper-inline__btn btn-stepper-sumar')
                .text('+');
            return $stepper.append($btnRestar, $valor, $btnSumar);
        }
        return $('<button>')
            .attr({ type: 'button', 'data-id': id })
            .addClass('card-item__btn-simular tarjeta-ods__boton--destacado btn-tactil')
            .text('+ Agregar');
    }

    function sincronizarControlesTarjetas() {
        $('.card-item__control-cantidad').each(function () {
            const id = this.getAttribute('data-id');
            $(this).empty().append(construirControlCantidadTarjeta(id));
        });
    }

    function construirTarjetaProducto(item) {
        const esResaltada = productoResaltadoId && String(item.id) === String(productoResaltadoId);
        const $card = $('<article>')
            .addClass('card-item' + (esResaltada ? ' card-item--resaltada' : ''))
            .attr('data-id', item.id);
        const esSvg = String(item.portada || '').indexOf('image/svg+xml') !== -1;
        const claseMedia = CLASE_MEDIA_CATEGORIA[item.categoria] || 'card-item__media--velas';
        const $media = $('<div>')
            .addClass('card-item__media ' + claseMedia)
            .attr({ 'data-detalle-id': item.id, title: 'Ver detalles de ' + item.nombre });
        const $img = $('<img>')
            .addClass('tarjeta-ods__imagen' + (esSvg ? '' : ' tarjeta-ods__imagen--foto'))
            .attr('src', item.portada)
            .attr('alt', item.alt || ('Producto de fiesta ' + item.nombre))
            .attr('loading', 'lazy');
        const $precioTag = $('<strong>')
            .addClass('card-item__precio card-item__precio-flotante')
            .text(CONFIG_NEGOCIO.moneda + ' ' + Number(item.precio).toFixed(2));
        $media.append($img, $precioTag);
        const $franjaCat = $('<div>').addClass('card-item__franja-cat')
            .append($('<span>').addClass('insignia-categoria').text(item.categoria));
        const $cuerpo = $('<div>').addClass('card-item__cuerpo');
        const $titulo = $('<h3>')
            .addClass('card-item__titulo card-item__enlace-detalle')
            .attr({ tabindex: '0', role: 'button', 'data-detalle-id': item.id })
            .text(item.nombre);
        const subtexto = (item.subcategoria || item.presentacion || 'Cotillon de fiesta') + ' | En stock';
        const $meta = $('<p>').addClass('card-item__meta').text(subtexto);
        const $controlCant = $('<div>').addClass('card-item__control-cantidad').attr('data-id', item.id).append(construirControlCantidadTarjeta(item.id));
        const $btnPagarYa = $('<button>')
            .attr({ type: 'button', 'data-id': item.id })
            .addClass('card-item__btn-comprar-ya btn-tactil')
            .text('Pagar ya');
        const $acciones = $('<div>').addClass('card-item__acciones').append($controlCant, $btnPagarYa);
        const $pie = $('<div>').addClass('card-item__pie').append($acciones);

        $cuerpo.append($titulo, $meta, $pie);
        $card.append($media, $franjaCat, $cuerpo);
        return $card;
    }

    // Semana 3 - Vista Completa de Detalle de Producto
    let productoDetalleActual = null;
    let cantidadDetalleActual = 1;

    function abrirDetalleProducto(idProducto) {
        const prod = catalogoCompleto.find((x) => String(x.id) === String(idProducto));
        if (!prod) return;
        productoDetalleActual = prod;
        cantidadDetalleActual = 1;

        $('#detalleRutaProducto').text('Catalogo > ' + (prod.categoria || 'Fiesta') + ' > ' + prod.nombre);
        $('#detalleProductoImagen')
            .attr('src', prod.portada)
            .attr('alt', prod.alt || ('Fotografia de ' + prod.nombre));
        $('#detalleProductoCategoria').text(prod.categoria || 'Cotillon de Fiesta');
        $('#detalleProductoTitulo').text(prod.nombre);
        $('#detalleProductoPrecio').text(CONFIG_NEGOCIO.moneda + ' ' + Number(prod.precio || 0).toFixed(2));
        const stockNum = Number(prod.stock || 50);
        $('#detalleProductoStock span').text(stockNum > 0 ? 'En stock - Listo para entrega' : 'Consultar disponibilidad');
        $('#detalleProductoDescripcion').text(prod.descripcion || 'Articulo ideal para decorar y celebrar tus momentos especiales.');
        $('#detalleProductoTematica').empty()
            .append($('<strong>').text('Colores / Tematicas: '))
            .append(document.createTextNode(prod.tematica || prod.subcategoria || prod.nombre));
        $('#detalleProductoPresentacion').empty()
            .append($('<strong>').text('Presentacion: '))
            .append(document.createTextNode(prod.presentacion || 'Unidad / Pack listo para usar'));
        $('#detalleProductoFicha').text(prod.fichaTecnica || '');
        $('#detalleCantidadValor').text(cantidadDetalleActual);

        const mismaCat = catalogoPrincipal.filter((x) => x.categoria === prod.categoria && String(x.id) !== String(prod.id));
        const otros = catalogoPrincipal.filter((x) => x.categoria !== prod.categoria && String(x.id) !== String(prod.id));
        const relacionados = mismaCat.concat(otros).slice(0, 4);
        const $rel = $('#contenedorRelacionados').empty();
        relacionados.forEach((itemRel) => {
            $rel.append(construirTarjetaProducto(itemRel));
        });

        mostrarVista('vistaDetalleProducto');
        registrarBitacoraDom('DETALLE_PRODUCTO', 'Abierto: ' + prod.nombre);
    }

    $('#btnVolverCatalogo').on('click', function () {
        mostrarVista('vista-catalogo');
    });

    $('#btnDetalleMenos').on('click', function () {
        cantidadDetalleActual = Math.max(1, cantidadDetalleActual - 1);
        $('#detalleCantidadValor').text(cantidadDetalleActual);
    });

    $('#btnDetalleMas').on('click', function () {
        cantidadDetalleActual = Math.min(99, cantidadDetalleActual + 1);
        $('#detalleCantidadValor').text(cantidadDetalleActual);
    });

    $('#btnDetalleAgregar').on('click', function () {
        if (!productoDetalleActual) return;
        agregarAlCarrito(productoDetalleActual, false, cantidadDetalleActual);
    });

    $('#btnDetalleComprarAhora').on('click', function () {
        if (!productoDetalleActual) return;
        agregarAlCarrito(productoDetalleActual, true, cantidadDetalleActual);
        abrirModalCheckout();
    });

    $('#vista-catalogo, #vistaDetalleProducto').on('click', '.card-item__media, .card-item__enlace-detalle', function () {
        const id = this.getAttribute('data-detalle-id') || $(this).closest('.card-item').attr('data-id');
        if (id) abrirDetalleProducto(id);
    });

    $('#vista-catalogo, #vistaDetalleProducto').on('keydown', '.card-item__enlace-detalle', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const id = this.getAttribute('data-detalle-id') || $(this).closest('.card-item').attr('data-id');
            if (id) abrirDetalleProducto(id);
        }
    });

    function renderizarFranjaPaquetes() {
        const $cont = $('#contenedorPaquetesRecomendados').empty();
        PAQUETES_RECOMENDADOS.forEach((pack) => {
            $cont.append(construirTarjetaProducto(pack));
        });
    }

    function renderizarTarjetasCatalogo() {
        const $contenedor = $('#contenedor-tarjetas');
        $contenedor.empty();
        const texto = terminoBusqueda.trim().toLowerCase();
        const orden = $('#selector-orden').val() || 'destacado';

        if (texto && contieneGroserias(texto)) {
            $('#resultadoFiltro').text('Mostrando 0 de ' + catalogoPrincipal.length + ' productos.');
            $contenedor.append($('<p>').addClass('mensaje-error-campo').attr('role', 'alert').text('Lenguaje no permitido. Por favor escribe de forma respetuosa.'));
            return;
        }

        let filtrados = catalogoPrincipal.filter((item) => {
            const okCat = categoriaActiva === 'todos' || item.categoria === categoriaActiva;
            const okSub = !subcategoriaActiva || item.subcategoria === subcategoriaActiva;
            const bolsa = (item.nombre + ' ' + item.id + ' ' + item.categoria + ' ' + (item.subcategoria || '') + ' ' + (item.tematica || '') + ' ' + (item.descripcion || '')).toLowerCase();
            const okTxt = !texto || bolsa.indexOf(texto) !== -1;
            return okCat && okSub && okTxt;
        });

        if (orden === 'precio-asc') filtrados.sort((a, b) => Number(a.precio) - Number(b.precio));
        if (orden === 'precio-desc') filtrados.sort((a, b) => Number(b.precio) - Number(a.precio));
        if (orden === 'nombre-asc') filtrados.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

        $('#resultadoFiltro').text('Mostrando ' + filtrados.length + ' de ' + catalogoPrincipal.length + ' productos.');

        if (filtrados.length === 0) {
            $contenedor.append($('<p>').addClass('micro-guia').text('No se encontraron productos para el filtro seleccionado.'));
            return;
        }

        filtrados.forEach((item) => $contenedor.append(construirTarjetaProducto(item)));
    }

    // Semana 2 - Filtro de 3 Capas
    function actualizarSubcategoriasCapa2(linea) {
        const $capa2 = $('#capa2');
        $capa2.empty();
        const lista = CONFIG_NEGOCIO.subcategoriasPorLinea[linea] || [];
        if (!linea || lista.length === 0) {
            $capa2.append($('<option>').val('').text('Elige primero una categoria')).prop('disabled', true);
            subcategoriaActiva = '';
            return;
        }
        $capa2.append($('<option>').val('').text('Todas las subcategorias'));
        lista.forEach((s) => $capa2.append($('<option>').val(s.clave).text(s.etiqueta)));
        $capa2.prop('disabled', false);
    }

    function actualizarBannerCategoria() {
        $('#banner-linea').removeClass('banner-linea--velas banner-linea--vajilla banner-linea--globos banner-linea--eventos');
        if (categoriaActiva !== 'todos' && CLASE_BANNER_CATEGORIA[categoriaActiva]) {
            $('#banner-linea').addClass(CLASE_BANNER_CATEGORIA[categoriaActiva]);
        }
        const etiqueta = categoriaActiva === 'todos' ? 'Todas las Categorias' : categoriaActiva.toUpperCase();
        $('#indicador-linea-activa').html('<strong>' + etiqueta + '</strong>');
        $('#rutaCategoriaActual').text(categoriaActiva === 'todos' ? 'Inicio > Catalogo' : ('Inicio > Catalogo > ' + categoriaActiva));
        $('#gridCategoriasVisuales .cat-visual-card').each(function () {
            const esActiva = this.getAttribute('data-categoria') === categoriaActiva;
            $(this).toggleClass('cat-visual-card--activa', esActiva).attr('aria-pressed', String(esActiva));
        });
    }

    function seleccionarCategoria(cat) {
        categoriaActiva = cat || 'todos';
        subcategoriaActiva = '';
        productoResaltadoId = '';
        $('#grupo-filtros-categoria .btn-filtro').removeClass('btn-filtro--activo');
        $('#grupo-filtros-categoria .btn-filtro[data-categoria="' + categoriaActiva + '"]').addClass('btn-filtro--activo');
        $('#capa1').val(categoriaActiva === 'todos' ? '' : categoriaActiva);
        actualizarSubcategoriasCapa2(categoriaActiva === 'todos' ? '' : categoriaActiva);
        actualizarBannerCategoria();
        renderizarTarjetasCatalogo();
    }

    $('#grupo-filtros-categoria').on('click', '.btn-filtro', function () {
        seleccionarCategoria(this.getAttribute('data-categoria'));
    });

    $('#gridCategoriasVisuales').on('click', '.cat-visual-card', function () {
        const catElegida = this.getAttribute('data-categoria');
        seleccionarCategoria(catElegida);
        const rejilla = document.getElementById('contenedor-tarjetas');
        if (rejilla) {
            rejilla.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });

    $('#btnToggleCascada').on('click', function () {
        const panel = document.getElementById('filtros-cascada');
        if (!panel) return;
        panel.hidden = !panel.hidden;
        this.setAttribute('aria-expanded', String(!panel.hidden));
    });

    $('#capa1').on('change', function () {
        const val = $(this).val();
        categoriaActiva = val || 'todos';
        subcategoriaActiva = '';
        $('#grupo-filtros-categoria .btn-filtro').removeClass('btn-filtro--activo');
        $('#grupo-filtros-categoria .btn-filtro[data-categoria="' + categoriaActiva + '"]').addClass('btn-filtro--activo');
        actualizarSubcategoriasCapa2(val);
        actualizarBannerCategoria();
        renderizarTarjetasCatalogo();
    });

    $('#capa2').on('change', function () {
        subcategoriaActiva = $(this).val() || '';
        renderizarTarjetasCatalogo();
    });

    $('#selector-orden').on('change', renderizarTarjetasCatalogo);

    // Semana 3 - Flujo de Pago Rapido y Carrito Boutique
    const URL_LOGO_RESPALDO_CARRITO = 'https://www.dropbox.com/scl/fi/xgxpko5fk9m8msyq81bw3/809d314b-2d7d-4ffc-80e9-f8357cb0ad87.jpg?rlkey=ha5kxcldpuk7tj4l051wedov7&st=s0bpl61w&raw=1';
    let temporizadorCierreCarrito = null;

    function obtenerPortadaProductoCarrito(item) {
        const portadaGuardada = String((item && item.portada) || '').trim();
        if (portadaGuardada && portadaGuardada.indexOf('image/svg+xml') === -1) {
            return portadaGuardada;
        }
        const idBuscado = String((item && item.id) || '');
        const fuente = catalogoCompleto.length > 0 ? catalogoCompleto : CATALOGO_RESPALDO.concat(PAQUETES_RECOMENDADOS);
        const encontrado = fuente.find((x) => String(x.id) === idBuscado);
        if (encontrado && encontrado.portada) {
            return encontrado.portada;
        }
        return URL_LOGO_RESPALDO_CARRITO;
    }

    function actualizarBarraPagoRapido() {
        const barra = document.getElementById('barraPagoRapido');
        if (!barra) return;
        const esCliente = api.normalizarRol(sesionActiva.rol) === 'cliente';
        const unidades = carrito.reduce((acc, it) => acc + Number(it.cantidad || 0), 0);
        const subtotal = carrito.reduce((acc, it) => acc + Number(it.cantidad || 0) * Number(it.precio || 0), 0);
        const total = subtotal * (1 + TASA_IMPUESTO);
        const etiquetaItems = unidades === 1 ? '1 item' : (unidades + ' items');
        $('#barraPagoResumen').text(etiquetaItems + ' | ' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2));
        const panelCar = document.getElementById('panelCarritoDrawer');
        const drawerAbierto = Boolean(panelCar && panelCar.classList.contains('carrito-drawer--abierto'));
        const modalAbierto = !$('#modalCheckout').prop('hidden');
        const visible = esCliente && unidades > 0 && !drawerAbierto && !modalAbierto;
        barra.hidden = !visible;
        document.body.classList.toggle('con-barra-pago', visible);
    }

    function renderizarCarrito() {
        const $lista = $('#listaItemsCarrito').empty();
        let unidades = 0;
        let subtotal = 0;
        carrito.forEach((item) => {
            const cant = Math.max(1, Number(item.cantidad || 1));
            const precioUnit = Number(item.precio || 0);
            const subItem = cant * precioUnit;
            unidades += cant;
            subtotal += subItem;

            const $li = $('<li>').addClass('carrito-item');
            const $thumb = $('<img>')
                .addClass('carrito-item__thumb')
                .attr('src', obtenerPortadaProductoCarrito(item))
                .attr('alt', 'Fotografia de ' + (item.nombre || 'producto de fiesta'))
                .attr('loading', 'lazy');
            const $info = $('<div>').addClass('carrito-item__info')
                .append($('<strong>').addClass('carrito-item__nombre').text(item.nombre || 'Producto de fiesta'))
                .append(
                    $('<span>').addClass('carrito-item__precios')
                        .append(document.createTextNode(CONFIG_NEGOCIO.moneda + ' ' + precioUnit.toFixed(2) + ' c/u \u00B7 Subtotal: '))
                        .append($('<span>').addClass('carrito-item__subtotal').text(CONFIG_NEGOCIO.moneda + ' ' + subItem.toFixed(2)))
                );
            const $stepper = $('<div>').addClass('carrito-stepper');
            const $btnMenos = $('<button>')
                .attr({ type: 'button', 'aria-label': 'Restar unidad de ' + (item.nombre || 'producto'), 'data-id': item.id })
                .addClass('carrito-stepper__btn btn-restar-carrito')
                .text('-');
            const $valor = $('<span>').addClass('carrito-stepper__valor').attr('aria-live', 'polite').text(cant);
            const $btnMas = $('<button>')
                .attr({ type: 'button', 'aria-label': 'Sumar unidad de ' + (item.nombre || 'producto'), 'data-id': item.id })
                .addClass('carrito-stepper__btn carrito-stepper__btn--mas btn-sumar-carrito')
                .text('+');
            $stepper.append($btnMenos, $valor, $btnMas);

            $li.append($thumb, $info, $stepper);
            $lista.append($li);
        });
        const impuesto = subtotal * TASA_IMPUESTO;
        const total = subtotal + impuesto;
        const tieneItems = carrito.length > 0;
        $('#carritoVacioMensaje').prop('hidden', tieneItems);
        $('#listaItemsCarrito').prop('hidden', !tieneItems);
        $('#carritoUnidades').text(unidades);
        $('#carritoCabeceraBadge').text(unidades === 1 ? '1 articulo' : (unidades + ' articulos'));
        $('#badgeCarritoHeader').text(unidades);
        $('#montoCarritoHeader').text(CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2));
        $('#carritoSubtotal').text(CONFIG_NEGOCIO.moneda + ' ' + subtotal.toFixed(2));
        $('#carritoImpuesto').text(CONFIG_NEGOCIO.moneda + ' ' + impuesto.toFixed(2));
        $('#carritoTotal').text(CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2));
        guardarCarritoLocal();
        sincronizarControlesTarjetas();
        actualizarBarraPagoRapido();
    }

    function agregarAlCarrito(prod, silencioso, cantidadAgregar) {
        const incremento = Math.max(1, parseInt(cantidadAgregar, 10) || 1);
        const existente = carrito.find((x) => String(x.id) === String(prod.id));
        if (existente) {
            existente.cantidad += incremento;
            if (!existente.portada && prod.portada) {
                existente.portada = prod.portada;
            }
        } else {
            carrito.push({
                id: prod.id,
                nombre: prod.nombre,
                precio: Number(prod.precio || 0),
                cantidad: incremento,
                portada: prod.portada || ''
            });
        }
        renderizarCarrito();
        if (!silencioso) {
            mostrarToast('Agregado a tu fiesta: ' + prod.nombre + (incremento > 1 ? (' (x' + incremento + ')') : ''), 'exito');
        }
        registrarBitacoraDom('CARRITO', 'Agregado ' + prod.nombre + ' x' + incremento);
    }

    function actualizarCantidadProducto(id, delta) {
        const idx = carrito.findIndex((x) => String(x.id) === String(id));
        if (idx === -1) {
            if (delta > 0) {
                const prod = catalogoCompleto.find((x) => String(x.id) === String(id));
                if (prod) agregarAlCarrito(prod, true);
            }
            return;
        }
        carrito[idx].cantidad += delta;
        if (carrito[idx].cantidad <= 0) {
            carrito.splice(idx, 1);
        }
        renderizarCarrito();
    }

    $('#vista-catalogo, #vistaDetalleProducto').on('click', '.card-item__btn-simular', function (e) {
        e.stopPropagation();
        const id = this.getAttribute('data-id');
        const prod = catalogoCompleto.find((x) => String(x.id) === String(id));
        if (prod) agregarAlCarrito(prod);
    });

    $('#vista-catalogo, #vistaDetalleProducto').on('click', '.btn-stepper-sumar', function (e) {
        e.stopPropagation();
        actualizarCantidadProducto(this.getAttribute('data-id'), 1);
    });

    $('#vista-catalogo, #vistaDetalleProducto').on('click', '.btn-stepper-restar', function (e) {
        e.stopPropagation();
        actualizarCantidadProducto(this.getAttribute('data-id'), -1);
    });

    $('#vista-catalogo, #vistaDetalleProducto').on('click', '.card-item__btn-comprar-ya', function (e) {
        e.stopPropagation();
        const id = this.getAttribute('data-id');
        const prod = catalogoCompleto.find((x) => String(x.id) === String(id));
        if (!prod) return;
        if (obtenerCantidadEnCarrito(prod.id) === 0) {
            agregarAlCarrito(prod, true);
        }
        abrirModalCheckout();
    });

    $('#listaItemsCarrito').on('click', '.btn-sumar-carrito', function () {
        actualizarCantidadProducto(this.getAttribute('data-id'), 1);
    });

    $('#listaItemsCarrito').on('click', '.btn-restar-carrito', function () {
        actualizarCantidadProducto(this.getAttribute('data-id'), -1);
    });

    function abrirCarrito() {
        clearTimeout(temporizadorCierreCarrito);
        const panel = document.getElementById('panelCarritoDrawer');
        const backdrop = document.getElementById('carritoBackdrop');
        if (!panel || !backdrop) return;
        backdrop.hidden = false;
        panel.hidden = false;
        void panel.offsetHeight;
        backdrop.classList.add('carrito-backdrop--abierto');
        panel.classList.add('carrito-drawer--abierto');
        document.body.classList.add('carrito-abierto');
        actualizarBarraPagoRapido();
    }

    function cerrarCarrito(inmediato) {
        clearTimeout(temporizadorCierreCarrito);
        const panel = document.getElementById('panelCarritoDrawer');
        const backdrop = document.getElementById('carritoBackdrop');
        document.body.classList.remove('carrito-abierto');
        if (panel) panel.classList.remove('carrito-drawer--abierto');
        if (backdrop) backdrop.classList.remove('carrito-backdrop--abierto');
        actualizarBarraPagoRapido();
        if (inmediato) {
            if (backdrop) backdrop.hidden = true;
            if (panel) panel.hidden = true;
            return;
        }
        temporizadorCierreCarrito = setTimeout(() => {
            if (panel && !panel.classList.contains('carrito-drawer--abierto')) {
                panel.hidden = true;
            }
            if (backdrop && !backdrop.classList.contains('carrito-backdrop--abierto')) {
                backdrop.hidden = true;
            }
        }, 260);
    }

    $('#btnCarritoHeader, #btnBarraVerCarrito').on('click', abrirCarrito);
    $('#btnBarraPagarAhora').on('click', () => abrirModalCheckout());
    $('#btnCerrarCarrito, #carritoBackdrop').on('click', () => cerrarCarrito(false));
    $('#btnExplorarDesdeCarrito').on('click', function () {
        cerrarCarrito(false);
        mostrarVista('vista-catalogo');
    });
    $('#btnIrAMisPedidosCarrito').on('click', function () {
        cerrarCarrito(true);
        mostrarVista('vistaMisPedidos');
    });
    $('#btnVaciarCarrito').on('click', function () {
        carrito = [];
        pedidoEnEdicionId = null;
        renderizarCarrito();
        mostrarToast('Carrito vaciado.', 'alerta');
    });

    function formatearMinutosSegundos(totalSeg) {
        const sLimpio = Math.max(0, Math.floor(totalSeg));
        const min = Math.floor(sLimpio / 60);
        const seg = sLimpio % 60;
        return String(min).padStart(2, '0') + ':' + String(seg).padStart(2, '0');
    }

    function iniciarTemporizadorCheckout() {
        clearInterval(temporizadorCheckout);
        segundosCheckout = DURACION_CHECKOUT_SEG;
        $('#temporizadorTexto').text(formatearMinutosSegundos(segundosCheckout));
        $('#barraProgresoTiempo').css('width', '100%');
        temporizadorCheckout = setInterval(() => {
            segundosCheckout -= 1;
            if (segundosCheckout <= 0) {
                segundosCheckout = DURACION_CHECKOUT_SEG;
                $('#temporizadorTexto').text(formatearMinutosSegundos(segundosCheckout));
                $('#barraProgresoTiempo').css('width', '100%');
                mostrarToast('Tiempo renovado por 5 minutos mas', 'alerta');
                return;
            }
            $('#temporizadorTexto').text(formatearMinutosSegundos(segundosCheckout));
            $('#barraProgresoTiempo').css('width', ((segundosCheckout / DURACION_CHECKOUT_SEG) * 100) + '%');
        }, 1000);
    }

    const CLAVE_NOMBRE_INVITADO = 'nombreInvitado_' + api.PROYECTO_ACTUAL;
    function obtenerNombreInvitadoGuardado() {
        try {
            return String(sessionStorage.getItem(CLAVE_NOMBRE_INVITADO) || '').trim();
        } catch (err) {
            return '';
        }
    }

    function guardarNombreInvitado(nombre) {
        try {
            if (nombre) sessionStorage.setItem(CLAVE_NOMBRE_INVITADO, nombre);
        } catch (err) {
        }
    }

    // Semana 3 - Panel Dinamico de Forma de Pago
    function calcularTotalCheckoutActual() {
        const subtotal = carrito.reduce((acc, it) => acc + Number(it.precio || 0) * Number(it.cantidad || 0), 0);
        return Number((subtotal * (1 + TASA_IMPUESTO)).toFixed(2));
    }

    function construirQrSvgInline() {
        const svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 210" width="210" height="210">',
            '<rect width="210" height="210" rx="14" fill="#ffffff"/>',
            '<rect x="14" y="14" width="54" height="54" rx="6" fill="none" stroke="#1e1b4b" stroke-width="8"/>',
            '<rect x="28" y="28" width="26" height="26" rx="3" fill="#db2777"/>',
            '<rect x="142" y="14" width="54" height="54" rx="6" fill="none" stroke="#1e1b4b" stroke-width="8"/>',
            '<rect x="156" y="28" width="26" height="26" rx="3" fill="#0284c7"/>',
            '<rect x="14" y="142" width="54" height="54" rx="6" fill="none" stroke="#1e1b4b" stroke-width="8"/>',
            '<rect x="28" y="156" width="26" height="26" rx="3" fill="#7c3aed"/>',
            '<g fill="#1e1b4b">',
            '<rect x="82" y="14" width="12" height="12"/><rect x="102" y="14" width="12" height="12"/><rect x="122" y="14" width="10" height="12"/>',
            '<rect x="82" y="34" width="22" height="10"/><rect x="114" y="34" width="18" height="10"/>',
            '<rect x="82" y="54" width="10" height="14"/><rect x="102" y="54" width="14" height="14"/><rect x="122" y="54" width="10" height="14"/>',
            '<rect x="14" y="82" width="14" height="12"/><rect x="36" y="82" width="14" height="12"/><rect x="58" y="82" width="12" height="24"/>',
            '<rect x="14" y="104" width="26" height="12"/><rect x="48" y="114" width="22" height="14"/>',
            '<rect x="14" y="124" width="18" height="10"/><rect x="142" y="82" width="14" height="14"/><rect x="164" y="82" width="32" height="12"/>',
            '<rect x="142" y="104" width="24" height="12"/><rect x="176" y="104" width="20" height="22"/>',
            '<rect x="142" y="124" width="12" height="10"/><rect x="82" y="142" width="14" height="14"/><rect x="104" y="142" width="26" height="12"/>',
            '<rect x="142" y="142" width="16" height="16"/><rect x="168" y="142" width="28" height="14"/>',
            '<rect x="82" y="164" width="26" height="12"/><rect x="118" y="164" width="16" height="14"/><rect x="142" y="168" width="22" height="12"/>',
            '<rect x="174" y="166" width="22" height="30"/><rect x="82" y="184" width="14" height="12"/><rect x="104" y="184" width="28" height="12"/>',
            '<rect x="142" y="186" width="24" height="10"/>',
            '</g>',
            '<rect x="78" y="78" width="54" height="54" rx="12" fill="#db2777" stroke="#ffffff" stroke-width="4"/>',
            '<text x="105" y="112" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="22" font-weight="bold">CS</text>',
            '</svg>'
        ].join('');
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function extraerDatosFormaPagoGuardada(formaPagoRaw) {
        const texto = String(formaPagoRaw || 'Pago por QR').trim();
        let tipo = 'Pago por QR';
        if (texto.indexOf('Transferencia Bancaria') === 0) {
            tipo = 'Transferencia Bancaria';
        } else if (texto.indexOf('Efectivo Contra Entrega') === 0) {
            tipo = 'Efectivo Contra Entrega';
        }
        const matchRef = texto.match(/\(Ref:\s*([^)]+)\)/i);
        const matchEfec = texto.match(/Paga con\s+(?:Bs\.?\s*)?([0-9]+(?:\.[0-9]+)?)/i);
        return {
            tipo: tipo,
            referencia: matchRef ? matchRef[1].trim() : '',
            montoEfectivo: matchEfec ? matchEfec[1].trim() : ''
        };
    }

    function actualizarCalculoCambioEfectivo(total) {
        const $texto = $('#textoCambioEfectivo');
        if (!$texto.length) return;
        const crudo = String($('#inputMontoEfectivo').val() || '').trim();
        $texto.removeClass('panel-detalle-pago__cambio--ok panel-detalle-pago__cambio--alerta');
        if (!crudo) {
            $texto.text('Ingresa el monto con el que pagaras para calcular tu cambio.');
            return;
        }
        const monto = Number(crudo);
        if (!Number.isFinite(monto) || monto <= 0) {
            $texto.addClass('panel-detalle-pago__cambio--alerta').text('Ingresa un monto valido mayor a 0.');
            return;
        }
        if (monto + 0.001 < total) {
            $texto.addClass('panel-detalle-pago__cambio--alerta').text(
                'El monto ingresado (' + CONFIG_NEGOCIO.moneda + ' ' + monto.toFixed(2) + ') es menor al total a pagar (' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2) + ').'
            );
            return;
        }
        const cambio = Number((monto - total).toFixed(2));
        if (cambio <= 0.005) {
            $texto.addClass('panel-detalle-pago__cambio--ok').text('Monto exacto (no requiere cambio).');
            return;
        }
        $texto.addClass('panel-detalle-pago__cambio--ok').text('Cambio a entregar: ' + CONFIG_NEGOCIO.moneda + ' ' + cambio.toFixed(2));
    }

    function renderizarPanelDetallePago(valoresIniciales) {
        const $panel = $('#panelDetallePago').empty();
        if (!$panel.length) return;
        const forma = String($('#checkoutPago').val() || 'Pago por QR');
        const total = calcularTotalCheckoutActual();
        const refInicial = String((valoresIniciales && valoresIniciales.referencia) || '');
        const montoInicial = String((valoresIniciales && valoresIniciales.montoEfectivo) || '');

        if (forma === 'Pago por QR') {
            const urlQrReal = String(CONFIG_PAGO_NEGOCIO.qrUrl || '').trim();
            const srcQr = urlQrReal || construirQrSvgInline();
            const $cab = $('<div>').addClass('panel-detalle-pago__cabecera')
                .append($('<strong>').addClass('panel-detalle-pago__titulo').text('Escanea y transfiere por QR'))
                .append($('<span>').addClass('panel-detalle-pago__monto').text('Total: ' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2)));
            const $qrCaja = $('<div>').addClass('panel-detalle-pago__qr-caja');
            const $imgQr = $('<img>')
                .addClass('panel-detalle-pago__qr-img img-ampliable')
                .attr('src', srcQr)
                .attr('alt', 'Codigo QR de cobro oficial de ' + CONFIG_PAGO_NEGOCIO.tienda);
            const $btnQr = $('<button>')
                .attr({ type: 'button', id: 'btnDescargarVerQr' })
                .addClass('panel-detalle-pago__btn')
                .append('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>')
                .append($('<span>').text('Descargar / Ver QR'))
                .on('click', function () {
                    abrirLightboxImagen(srcQr, 'QR de Cobro - ' + CONFIG_PAGO_NEGOCIO.tienda + ' (' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2) + ')');
                    try {
                        const a = document.createElement('a');
                        a.href = urlQrReal ? urlQrReal.replace('raw=1', 'dl=1') : srcQr;
                        a.download = urlQrReal ? 'QR-Cotillones-Snoopy.jpg' : 'QR-Cotillones-Snoopy.svg';
                        if (urlQrReal) {
                            a.target = '_blank';
                            a.rel = 'noopener noreferrer';
                        }
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    } catch (err) {
                    }
                });
            $qrCaja.append($imgQr, $btnQr);
            const $grupoRef = $('<div>').addClass('campo-grupo')
                .append($('<label>').attr('for', 'inputRefPago').addClass('etiqueta-campo').text('Comprobante o referencia QR'))
                .append($('<input>').attr({ type: 'text', id: 'inputRefPago', placeholder: 'Nro. de comprobante o referencia (opcional)' }).addClass('control-input').val(refInicial));
            $panel.append($cab, $qrCaja, $grupoRef);
            inyectarSpansErrorTiempoReal();
            actualizarEstadoBotonFormulario('checkout');
            return;
        }

        if (forma === 'Transferencia Bancaria') {
            const $cab = $('<div>').addClass('panel-detalle-pago__cabecera')
                .append($('<strong>').addClass('panel-detalle-pago__titulo').text('Datos para Transferencia Bancaria'))
                .append($('<span>').addClass('panel-detalle-pago__monto').text('Total: ' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2)));
            const $datos = $('<div>').addClass('panel-detalle-pago__datos')
                .append($('<div>').addClass('panel-detalle-pago__fila-dato').append($('<span>').addClass('panel-detalle-pago__etiqueta').text('Banco:')).append($('<span>').addClass('panel-detalle-pago__valor').text(CONFIG_PAGO_NEGOCIO.banco)))
                .append($('<div>').addClass('panel-detalle-pago__fila-dato').append($('<span>').addClass('panel-detalle-pago__etiqueta').text('Cuenta:')).append($('<span>').addClass('panel-detalle-pago__valor').text(CONFIG_PAGO_NEGOCIO.cuenta)))
                .append($('<div>').addClass('panel-detalle-pago__fila-dato').append($('<span>').addClass('panel-detalle-pago__etiqueta').text('Titular:')).append($('<span>').addClass('panel-detalle-pago__valor').text(CONFIG_PAGO_NEGOCIO.titular)))
                .append($('<div>').addClass('panel-detalle-pago__fila-dato').append($('<span>').addClass('panel-detalle-pago__etiqueta').text('Documento:')).append($('<span>').addClass('panel-detalle-pago__valor').text(CONFIG_PAGO_NEGOCIO.documento)));
            const $feedbackCopia = $('<span>').attr({ id: 'feedbackCopiaCuenta', 'aria-live': 'polite' }).addClass('panel-detalle-pago__feedback');
            const $btnCopiar = $('<button>')
                .attr({ type: 'button', id: 'btnCopiarCuenta' })
                .addClass('panel-detalle-pago__btn')
                .append('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>')
                .append($('<span>').text('Copiar Cuenta'))
                .on('click', async function () {
                    let copiado = false;
                    try {
                        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                            await navigator.clipboard.writeText(CONFIG_PAGO_NEGOCIO.cuenta);
                            copiado = true;
                        }
                    } catch (err) {
                    }
                    if (!copiado) {
                        const tmp = document.createElement('textarea');
                        tmp.value = CONFIG_PAGO_NEGOCIO.cuenta;
                        tmp.setAttribute('readonly', '');
                        document.body.appendChild(tmp);
                        tmp.select();
                        try {
                            copiado = document.execCommand('copy');
                        } catch (err2) {
                        }
                        document.body.removeChild(tmp);
                    }
                    $feedbackCopia.text(copiado ? 'Cuenta copiada' : ('Cuenta: ' + CONFIG_PAGO_NEGOCIO.cuenta));
                    mostrarToast('Cuenta copiada: ' + CONFIG_PAGO_NEGOCIO.cuenta, 'exito');
                    setTimeout(() => $feedbackCopia.text(''), 2600);
                });
            const $acciones = $('<div>').addClass('panel-detalle-pago__acciones').append($btnCopiar, $feedbackCopia);
            const $grupoRef = $('<div>').addClass('campo-grupo')
                .append($('<label>').attr('for', 'inputRefPago').addClass('etiqueta-campo').text('Comprobante bancario'))
                .append($('<input>').attr({ type: 'text', id: 'inputRefPago', placeholder: 'Nro. de operacion bancaria (opcional)' }).addClass('control-input').val(refInicial));
            $panel.append($cab, $datos, $acciones, $grupoRef);
            inyectarSpansErrorTiempoReal();
            actualizarEstadoBotonFormulario('checkout');
            return;
        }

        const $cabEf = $('<div>').addClass('panel-detalle-pago__cabecera')
            .append($('<strong>').addClass('panel-detalle-pago__titulo').text('Efectivo Contra Entrega'))
            .append($('<span>').addClass('panel-detalle-pago__monto').text('Total: ' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2)));
        const $grupoEf = $('<div>').addClass('campo-grupo')
            .append($('<label>').attr('for', 'inputMontoEfectivo').addClass('etiqueta-campo').text('Con cuanto pagas? (para llevar cambio)'))
            .append($('<input>').attr({ type: 'number', id: 'inputMontoEfectivo', min: '0', step: '1', inputmode: 'decimal', placeholder: 'Ej. 100' }).addClass('control-input').val(montoInicial));
        const $cambio = $('<p>').attr({ id: 'textoCambioEfectivo', 'aria-live': 'polite' }).addClass('panel-detalle-pago__cambio');
        $panel.append($cabEf, $grupoEf, $cambio);
        $('#inputMontoEfectivo').on('input', () => {
            actualizarCalculoCambioEfectivo(total);
            actualizarEstadoBotonFormulario('checkout');
        });
        inyectarSpansErrorTiempoReal();
        actualizarCalculoCambioEfectivo(total);
        actualizarEstadoBotonFormulario('checkout');
    }

    function construirTextoDetallePago(formaPagoBase, total) {
        if (formaPagoBase === 'Pago por QR' || formaPagoBase === 'Transferencia Bancaria') {
            const ref = String($('#inputRefPago').val() || '').trim();
            return ref ? (formaPagoBase + ' (Ref: ' + ref + ')') : formaPagoBase;
        }
        const montoCrudo = String($('#inputMontoEfectivo').val() || '').trim();
        const monto = Number(montoCrudo);
        if (montoCrudo && Number.isFinite(monto) && monto > 0) {
            if (monto + 0.001 < total) {
                return formaPagoBase + ' (Paga con ' + CONFIG_NEGOCIO.moneda + ' ' + monto.toFixed(2) + ' - Monto menor al total)';
            }
            const cambio = Number((monto - total).toFixed(2));
            if (cambio <= 0.005) {
                return formaPagoBase + ' (Monto exacto ' + CONFIG_NEGOCIO.moneda + ' ' + monto.toFixed(2) + ')';
            }
            return formaPagoBase + ' (Paga con ' + CONFIG_NEGOCIO.moneda + ' ' + monto.toFixed(2) + ' - Cambio: ' + CONFIG_NEGOCIO.moneda + ' ' + cambio.toFixed(2) + ')';
        }
        return formaPagoBase;
    }

    function abrirModalCheckout(pedidoEditar) {
        const esInvitado = sesionActiva.usuario === 'Invitado' || !sesionActiva.autenticada;
        let datosPagoIniciales = null;
        if (pedidoEditar && pedidoEditar.id) {
            pedidoEnEdicionId = pedidoEditar.id;
            if (Array.isArray(pedidoEditar.items) && pedidoEditar.items.length > 0) {
                carrito = pedidoEditar.items.map((it) => ({
                    id: it.id || ('ITEM-' + Date.now()),
                    nombre: it.nombre || 'Producto de fiesta',
                    precio: Number(it.precio || 0),
                    cantidad: Math.max(1, Number(it.cantidad || 1)),
                    portada: it.portada || ''
                }));
                renderizarCarrito();
            }
            datosPagoIniciales = extraerDatosFormaPagoGuardada(pedidoEditar.forma_pago);
            $('#tituloModalCheckout').text('Editar Pedido #' + pedidoEditar.id);
            $('#btnSubmitCheckout').text('Guardar Cambios');
            $('#bloqueTimerCheckout').prop('hidden', true);
            $('#grupoCheckoutNombreCliente').prop('hidden', false);
            $('#checkoutNombreCliente').val(pedidoEditar.cliente || (esInvitado ? obtenerNombreInvitadoGuardado() : sesionActiva.usuario));
            const modCruda = String(pedidoEditar.modalidad || 'Envio a Domicilio');
            const partesMod = modCruda.split(' | Notas: ');
            $('#checkoutModalidad').val(partesMod[0] || 'Envio a Domicilio');
            $('#checkoutNotasEntrega').val(partesMod[1] || '');
            $('#checkoutPago').val(datosPagoIniciales.tipo);
        } else {
            pedidoEnEdicionId = null;
            if (carrito.length === 0) {
                mostrarToast('Agrega al menos un producto al carrito.', 'error');
                return;
            }
            $('#tituloModalCheckout').text('Confirmar Pedido de Fiesta');
            $('#btnSubmitCheckout').text('Confirmar Pedido');
            $('#bloqueTimerCheckout').prop('hidden', false);
            $('#grupoCheckoutNombreCliente').prop('hidden', !esInvitado);
            $('#checkoutNombreCliente').val(esInvitado ? obtenerNombreInvitadoGuardado() : sesionActiva.usuario);
            $('#checkoutNotasEntrega').val('');
            iniciarTemporizadorCheckout();
        }
        limpiarErrorCampo($('#checkoutNombreCliente'));
        limpiarErrorCampo($('#checkoutNotasEntrega'));
        $('#invitacionCuentaCheckout').prop('hidden', !esInvitado);
        cerrarCarrito(true);
        $('#feedbackCheckout').prop('hidden', true);
        renderizarPanelDetallePago(datosPagoIniciales);
        $('#modalCheckout').prop('hidden', false);
        actualizarEstadoBotonFormulario('checkout');
        actualizarBarraPagoRapido();
    }

    $('#checkoutPago').on('change', function () {
        renderizarPanelDetallePago();
    });

    function cerrarModalCheckout() {
        clearInterval(temporizadorCheckout);
        pedidoEnEdicionId = null;
        $('#modalCheckout').prop('hidden', true);
        actualizarBarraPagoRapido();
    }

    $('#btnAbrirCheckout').on('click', () => abrirModalCheckout());
    $('#btnCerrarCheckout').on('click', cerrarModalCheckout);

    $('#btnEjemploCotizador').on('click', function () {
        $('.btn-subtab[data-grupo="cotizador"]').removeClass('btn-subtab--activo');
        $('.btn-subtab[data-grupo="cotizador"][data-subtab="subtab-calculador"]').addClass('btn-subtab--activo');
        $('.panel-subtab[data-grupo="cotizador"]').each(function () {
            this.hidden = this.id !== 'subtab-calculador';
        });
        $('#hrs').val(2).trigger('input');
        $('#variantSelect').prop('selectedIndex', 1);
        const $tematica = $('#userTikTok');
        limpiarErrorCampo($tematica);
        $tematica.val('Paw Patrol azul y rojo - 5 anos').trigger('input');
        $('#errUserTikTok').text('Ejemplo listo').removeClass('estado-validacion-campo--error').addClass('estado-validacion-campo--ok');
        mostrarToast('Ejemplo cargado: 2 packs y combo Paw Patrol azul y rojo - 5 anos.', 'exito');
    });

    $('#hrs').on('input', function () {
        const cant = Math.max(1, parseInt($(this).val(), 10) || 1);
        $('#total').text(cant * CONFIG_NEGOCIO.tarifaCalculador);
    });

    $('#btnModal').on('click', function () {
        const cant = Math.max(1, parseInt($('#hrs').val(), 10) || 1);
        agregarAlCarrito({
            id: 'PACK-COT-' + cant,
            nombre: 'Pack Cotillon Fiesta (' + cant + ' packs)',
            precio: cant * CONFIG_NEGOCIO.tarifaCalculador
        }, true);
        abrirModalCheckout();
    });

    $('#orderForm').on('submit', function (e) {
        e.preventDefault();
        const $campoTematica = $('#userTikTok');
        limpiarErrorCampo($campoTematica);
        const tematica = String($campoTematica.val() || '').trim();
        const sel = document.getElementById('variantSelect');
        const opcion = sel.options[sel.selectedIndex];
        const validacion = validarTextoEnVivo(tematica, 'mensaje');
        if (!validacion.valido) {
            $('#errUserTikTok').text('Revisa este campo').removeClass('estado-validacion-campo--ok').addClass('estado-validacion-campo--error');
            mostrarErrorCampo($campoTematica, validacion.error);
            actualizarEstadoBotonFormulario('combo');
            return;
        }
        $('#errUserTikTok').text('Valido').removeClass('estado-validacion-campo--error').addClass('estado-validacion-campo--ok');
        agregarAlCarrito({
            id: 'COMBO-' + sel.selectedIndex,
            nombre: 'Combo Fiesta: ' + sel.value + ' (' + tematica + ')',
            precio: Number(opcion.getAttribute('data-precio') || 45)
        });
        $('#estadoOrdenDirecta')
            .removeClass('feedback-formulario--error')
            .addClass('feedback-formulario--exito')
            .text('Combo agregado al carrito con tematica ' + tematica + '.')
            .prop('hidden', false);
        this.reset();
        limpiarErrorCampo($campoTematica);
        actualizarEstadoBotonFormulario('combo');
    });

    $('#formCheckout').on('submit', async function (e) {
        e.preventDefault();
        const esInvitado = sesionActiva.usuario === 'Invitado' || !sesionActiva.autenticada;
        const $campoNombre = $('#checkoutNombreCliente');
        limpiarErrorCampo($campoNombre);
        const $campoNotas = $('#checkoutNotasEntrega');
        limpiarErrorCampo($campoNotas);
        const $campoRef = $('#inputRefPago');
        limpiarErrorCampo($campoRef);
        const $campoEfec = $('#inputMontoEfectivo');
        limpiarErrorCampo($campoEfec);
        $('#feedbackCheckout').prop('hidden', true);

        const cliente = (esInvitado || pedidoEnEdicionId)
            ? String($campoNombre.val() || '').trim()
            : String(sesionActiva.usuario || '').trim();
        const modalidadBase = String($('#checkoutModalidad').val() || 'Envio a Domicilio');
        const notasEntrega = String($campoNotas.val() || '').trim();
        const formaPagoBase = String($('#checkoutPago').val() || 'Pago por QR');
        if (esInvitado || pedidoEnEdicionId) {
            const valNombre = validarTextoEnVivo(cliente, 'nombre');
            if (!valNombre.valido) {
                mostrarErrorCampo($campoNombre, valNombre.error);
                actualizarEstadoBotonFormulario('checkout');
                return;
            }
        }
        if (notasEntrega) {
            const valNotas = validarTextoEnVivo(notasEntrega, 'mensaje');
            if (!valNotas.valido) {
                mostrarErrorCampo($campoNotas, valNotas.error);
                actualizarEstadoBotonFormulario('checkout');
                return;
            }
        }
        if ($campoRef.length && String($campoRef.val() || '').trim()) {
            const valRef = validarTextoEnVivo($campoRef.val(), 'referencia');
            if (!valRef.valido) {
                mostrarErrorCampo($campoRef, valRef.error);
                actualizarEstadoBotonFormulario('checkout');
                return;
            }
        }
        const modalidad = notasEntrega ? (modalidadBase + ' | Notas: ' + notasEntrega) : modalidadBase;
        const contienePromo = carrito.some((it) => String(it.id) === 'PROMO-EXPRESS');
        const itemsConfirmados = carrito.slice();
        const subtotal = itemsConfirmados.reduce((acc, it) => acc + it.precio * it.cantidad, 0);
        const total = Number((subtotal * (1 + TASA_IMPUESTO)).toFixed(2));
        if (formaPagoBase === 'Efectivo Contra Entrega') {
            const montoCrudo = String($campoEfec.val() || '').trim();
            if (montoCrudo) {
                const montoEfec = Number(montoCrudo);
                if (!Number.isFinite(montoEfec) || montoEfec + 0.001 < total) {
                    mostrarErrorCampo($campoEfec, 'El monto en efectivo debe ser mayor o igual al total (' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2) + ').');
                    return;
                }
            }
        }
        if (esInvitado) {
            guardarNombreInvitado(cliente);
        }
        const formaPagoDetalle = construirTextoDetallePago(formaPagoBase, total);
        const idEditando = pedidoEnEdicionId;

        let res;
        if (idEditando) {
            res = await api.actualizarPorId('pedidos', idEditando, {
                cliente: cliente,
                modalidad: modalidad,
                forma_pago: formaPagoDetalle,
                monto_total: total,
                items: itemsConfirmados
            });
            await api.registrarActividad(cliente, 'EDITAR_PEDIDO', 'Pedido #' + idEditando + ' actualizado (' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2) + ' | ' + formaPagoDetalle + ')');
        } else {
            res = await api.insertarRegistro('pedidos', {
                cliente: cliente,
                modalidad: modalidad,
                forma_pago: formaPagoDetalle,
                monto_total: total,
                items: itemsConfirmados,
                estado: 'pendiente'
            });
            await api.registrarActividad(cliente, 'NUEVO_PEDIDO', 'Total ' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2) + ' (' + modalidad + ' | ' + formaPagoDetalle + ')');
        }

        const idGenerado = idEditando || (Array.isArray(res && res.data) && res.data[0] && res.data[0].id ? res.data[0].id : '');
        const resumenComprobante = {
            id: idGenerado,
            cliente: cliente,
            items: itemsConfirmados,
            total: total,
            modalidad: modalidad,
            formaPago: formaPagoDetalle
        };

        if (contienePromo && promoActual) {
            marcarPromoReclamada(promoActual);
            pintarPromocionExpress();
        }
        carrito = [];
        pedidoEnEdicionId = null;
        renderizarCarrito();
        actualizarEstadoRedYAvisoOffline();
        cerrarModalCheckout();
        if (res.encolado) {
            mostrarToastComprobanteWhatsapp('Sin conexion: pedido guardado en cola local.', 'alerta', resumenComprobante);
        } else {
            mostrarToastComprobanteWhatsapp(
                idEditando ? ('Pedido #' + idEditando + ' actualizado correctamente.') : 'Pedido de fiesta confirmado con exito.',
                'exito',
                resumenComprobante
            );
        }
        if (!$('#vistaMisPedidos').prop('hidden')) {
            cargarMisPedidosCliente();
        }
    });

    // Semana 3 - Mis Pedidos del Cliente
    async function cargarMisPedidosCliente() {
        const $pend = $('#listaPedidosPendientesCliente').empty();
        const $hist = $('#listaPedidosHistorialCliente').empty();
        try {
            const filas = await api.listarTabla('pedidos', true, 80);
            const idsSesion = api.obtenerIdsPedidosSesion();
            const usuarioActivo = String(sesionActiva.usuario || '').trim().toLowerCase();
            const misPedidos = (Array.isArray(filas) ? filas : []).filter((p) => {
                const coincideId = idsSesion.indexOf(String(p.id)) !== -1;
                const coincideCliente = sesionActiva.autenticada && String(p.cliente || '').trim().toLowerCase() === usuarioActivo;
                return coincideId || coincideCliente;
            });

            const pendientes = misPedidos.filter((p) => String(p.estado || 'pendiente').toLowerCase() === 'pendiente');
            const historial = misPedidos.filter((p) => String(p.estado || 'pendiente').toLowerCase() !== 'pendiente');

            if (pendientes.length === 0) {
                $pend.append($('<p>').addClass('card-item__meta').text('No tienes pedidos pendientes de confirmacion en este momento.'));
            } else {
                pendientes.forEach((p) => {
                    const $card = $('<div>').addClass('tarjeta-operativa');
                    const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                        .append($('<strong>').text('Pedido #' + p.id + ' - ' + (p.cliente || 'Cliente')))
                        .append($('<span>').addClass('badge-estado badge-estado--pendiente').text('Pendiente'));
                    const resumenItems = Array.isArray(p.items)
                        ? p.items.map((it) => (it.nombre || 'Producto') + ' x' + (it.cantidad || 1)).join(', ')
                        : 'Detalle de pedido';
                    const $det = $('<p>').addClass('card-item__meta').text(resumenItems);
                    const $meta = $('<p>').addClass('card-item__meta').text((p.modalidad || '') + ' | ' + (p.forma_pago || '') + ' | Total: ' + CONFIG_NEGOCIO.moneda + ' ' + Number(p.monto_total || 0).toFixed(2));
                    const $acciones = $('<div>').addClass('fila-tactil');
                    const $confirmBox = $('<div>').addClass('fila-tactil').prop('hidden', true);

                    const $btnEditar = $('<button>').attr('type', 'button').addClass('btn-primario').text('Editar Pedido').on('click', () => {
                        abrirModalCheckout(p);
                    });
                    const $btnCancelar = $('<button>').attr('type', 'button').addClass('btn-peligro').text('Cancelar Pedido').on('click', () => {
                        $confirmBox.prop('hidden', false);
                    });
                    const $btnConfCanc = $('<button>').attr('type', 'button').addClass('btn-peligro').text('Confirmar Cancelacion').on('click', async () => {
                        const resCanc = await api.actualizarPorId('pedidos', p.id, { estado: 'cancelado' });
                        await api.registrarActividad(p.cliente || sesionActiva.usuario, 'CANCELAR_PEDIDO', 'Pedido #' + p.id + ' cancelado por cliente');
                        actualizarEstadoRedYAvisoOffline();
                        mostrarToast(resCanc.encolado ? 'Cancelacion encolada en FIFO offline.' : 'Pedido #' + p.id + ' cancelado.', 'alerta');
                        cargarMisPedidosCliente();
                    });
                    const $btnVolver = $('<button>').attr('type', 'button').addClass('btn-secundario').text('Mantener').on('click', () => {
                        $confirmBox.prop('hidden', true);
                    });
                    $confirmBox.append($('<span>').addClass('card-item__meta').text('Confirmas cancelar este pedido?'), $btnConfCanc, $btnVolver);
                    const $btnWaPend = crearBotonWhatsappComprobante({
                        id: p.id,
                        cliente: p.cliente || 'Cliente',
                        items: p.items,
                        total: p.monto_total,
                        modalidad: p.modalidad,
                        formaPago: p.forma_pago
                    });
                    $acciones.append($btnWaPend, $btnEditar, $btnCancelar);
                    $card.append($cab, $det, $meta, $acciones, $confirmBox);
                    $pend.append($card);
                });
            }

            if (historial.length === 0) {
                $hist.append($('<p>').addClass('card-item__meta').text('Aun no registras pedidos confirmados, despachados o cancelados.'));
            } else {
                historial.forEach((p) => {
                    const est = String(p.estado || 'confirmado').toLowerCase();
                    const $card = $('<div>').addClass('tarjeta-operativa');
                    const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                        .append($('<strong>').text('Pedido #' + p.id + ' - ' + (p.cliente || 'Cliente')))
                        .append($('<span>').addClass('badge-estado badge-estado--' + est).text(est));
                    const resumenItems = Array.isArray(p.items)
                        ? p.items.map((it) => (it.nombre || 'Producto') + ' x' + (it.cantidad || 1)).join(', ')
                        : 'Detalle de pedido';
                    const fechaTxt = p.created_at ? new Date(p.created_at).toLocaleString() : 'Registrado';
                    const $det = $('<p>').addClass('card-item__meta').text(resumenItems);
                    const $meta = $('<p>').addClass('card-item__meta').text(fechaTxt + ' | ' + (p.modalidad || '') + ' | ' + (p.forma_pago || '') + ' | ' + CONFIG_NEGOCIO.moneda + ' ' + Number(p.monto_total || 0).toFixed(2));
                    $card.append($cab, $det, $meta);
                    if (est !== 'cancelado') {
                        const $accHist = $('<div>').addClass('fila-tactil').append(crearBotonWhatsappComprobante({
                            id: p.id,
                            cliente: p.cliente || 'Cliente',
                            items: p.items,
                            total: p.monto_total,
                            modalidad: p.modalidad,
                            formaPago: p.forma_pago
                        }));
                        $card.append($accHist);
                    }
                    $hist.append($card);
                });
            }
        } catch (err) {
            $pend.append($('<p>').addClass('card-item__meta').text('Sin conexion para consultar pedidos en este momento.'));
        }
    }

    $('#btnRefrescarMisPedidos').on('click', cargarMisPedidosCliente);

    $('#formReserva').on('submit', async function (e) {
        e.preventDefault();
        const $campoCliente = $('#clienteNombre');
        limpiarErrorCampo($campoCliente);
        const cliente = String($campoCliente.val() || '').trim();
        const salaRaw = String($('#salaSelect').val() || 'EVENTO-01|Retiro en Tienda Cotillones Snoopy').split('|');
        const fecha = String($('#fechaReserva').val() || new Date().toISOString().slice(0, 10));
        const horario = String($('#horarioReserva').val() || '09:30');
        const valCliente = validarTextoEnVivo(cliente, 'nombre');
        if (!valCliente.valido) {
            $('#errClienteReserva').text('Revisa este campo').removeClass('estado-validacion-campo--ok').addClass('estado-validacion-campo--error');
            mostrarErrorCampo($campoCliente, valCliente.error);
            actualizarEstadoBotonFormulario('reserva');
            return;
        }
        $('#errClienteReserva').text('OK').removeClass('estado-validacion-campo--error').addClass('estado-validacion-campo--ok');
        const res = await api.insertarRegistro('reservas', {
            cliente: cliente,
            estacion_codigo: salaRaw[0],
            detalle_sala: salaRaw[1] || salaRaw[0],
            fecha_reserva: fecha,
            horario: horario,
            duracion_horas: 1,
            estado: 'pendiente'
        });
        const $li = $('<li>').addClass('fila-cola-item').append($('<span>').addClass('titulo-truncado').text(cliente + ' - ' + (salaRaw[1] || salaRaw[0]) + ' (' + fecha + ' ' + horario + ')'));
        $('#listaReservas').prepend($li);
        await api.registrarActividad(cliente, 'RESERVA_EVENTO', (salaRaw[1] || salaRaw[0]) + ' ' + fecha + ' ' + horario);
        actualizarEstadoRedYAvisoOffline();
        this.reset();
        limpiarErrorCampo($campoCliente);
        actualizarEstadoBotonFormulario('reserva');
        mostrarToast(res.encolado ? 'Sin conexion: reserva guardada en cola local.' : 'Fecha de evento reservada con exito.', res.encolado ? 'alerta' : 'exito');
    });

    $('#btnPedir').on('click', function () {
        const $campoLista = $('#inputCancion');
        limpiarErrorCampo($campoLista);
        const texto = String($campoLista.val() || '').trim();
        const valLista = validarTextoEnVivo(texto, 'lista');
        if (!valLista.valido) {
            mostrarErrorCampo($campoLista, valLista.error);
            actualizarEstadoBotonFormulario('lista');
            return;
        }
        const $fila = $('<div>').addClass('fila-cola-item');
        const $titulo = $('<span>').addClass('titulo-truncado').text(texto);
        const $quitar = $('<button>').attr('type', 'button').addClass('btn-peligro btn-tactil').text('X').on('click', function () {
            $fila.remove();
        });
        $fila.append($titulo, $quitar);
        $('#listaCanciones').prepend($fila);
        $campoLista.val('');
        limpiarErrorCampo($campoLista);
        actualizarEstadoBotonFormulario('lista');
        registrarBitacoraDom('LISTA_FIESTA', 'Item anotado: ' + texto);
    });

    $('#formConsultaCliente').on('submit', async function (e) {
        e.preventDefault();
        const $campoMensaje = $('#consultaMensaje');
        limpiarErrorCampo($campoMensaje);
        const mensaje = String($campoMensaje.val() || '').trim();
        const valMensaje = validarTextoEnVivo(mensaje, 'mensaje');
        if (!valMensaje.valido) {
            $('#errConsultaMensaje').text('Revisa este campo').removeClass('estado-validacion-campo--ok').addClass('estado-validacion-campo--error');
            mostrarErrorCampo($campoMensaje, valMensaje.error);
            actualizarEstadoBotonFormulario('consulta');
            return;
        }
        $('#errConsultaMensaje').text('Enviada').removeClass('estado-validacion-campo--error').addClass('estado-validacion-campo--ok');
        const cliente = sesionActiva.usuario || 'Invitado';
        const res = await api.insertarRegistro('consultas', {
            cliente: cliente,
            mensaje: mensaje,
            respuesta: '',
            estado: 'pendiente'
        });
        await api.registrarActividad(cliente, 'CONSULTA_CLIENTE', mensaje);
        $('#consultaMensaje').val('');
        limpiarErrorCampo($campoMensaje);
        actualizarEstadoBotonFormulario('consulta');
        $('#feedbackConsultaCliente')
            .removeClass('feedback-formulario--error')
            .addClass(res.encolado ? 'feedback-formulario--alerta' : 'feedback-formulario--exito')
            .text(res.encolado ? 'Sin conexion: consulta guardada en cola FIFO. Se enviara al reconectar.' : 'Consulta enviada a Cotillones Snoopy.')
            .prop('hidden', false);
        actualizarEstadoRedYAvisoOffline();
        await cargarConsultasCliente();
    });

    $('#btnSincronizarColaGlobal').on('click', async function () {
        const res = await api.sincronizarColaFifo();
        actualizarEstadoRedYAvisoOffline();
        mostrarToast('Sincronizados: ' + res.procesados + ' | Pendientes: ' + res.pendientes, res.procesados > 0 ? 'exito' : 'alerta');
        if (res.procesados > 0) hidratarDatosSegunRol();
    });

    window.addEventListener('online', async () => {
        actualizarEstadoRedYAvisoOffline();
        const res = await api.sincronizarColaFifo();
        actualizarEstadoRedYAvisoOffline();
        if (res.procesados > 0) {
            mostrarToast('Cola FIFO sincronizada automaticamente (' + res.procesados + ' enviados).', 'exito');
            hidratarDatosSegunRol();
        }
    });
    window.addEventListener('offline', actualizarEstadoRedYAvisoOffline);

    function crearPromocionInicialDefecto() {
        const ahora = new Date();
        return {
            proyecto: api.PROYECTO_ACTUAL,
            titulo: PROMO_TITULO_DEFECTO,
            descripcion: PROMO_DESC_PUBLICA,
            precio: PROMO_PRECIO_DEFECTO,
            duracion_minutos: 15,
            expira_en: new Date(ahora.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            activa: true,
            actualizada_por: 'sistema',
            actualizada_en: ahora.toISOString()
        };
    }

    function esPromoPorVisita(promo) {
        if (!promo || !promo.expira_en || !promo.actualizada_en) return false;
        const expMs = new Date(promo.expira_en).getTime();
        const actMs = new Date(promo.actualizada_en).getTime();
        if (!Number.isFinite(expMs) || !Number.isFinite(actMs)) return false;
        return (expMs - actMs) > UMBRAL_EVERGREEN_MS;
    }

    function detectarModoVigencia(promo) {
        if (!promo || esPromoPorVisita(promo)) return 'evergreen';
        const expMs = new Date(promo.expira_en).getTime();
        const actMs = new Date(promo.actualizada_en || Date.now()).getTime();
        const diffMin = Number.isFinite(expMs) && Number.isFinite(actMs) ? Math.round((expMs - actMs) / 60000) : (Number(promo.duracion_minutos) || 15);
        if (diffMin >= 5000) return '7d';
        if (diffMin >= 720) return '24h';
        return '15m';
    }

    function obtenerClaveReclamoPromo(promo) {
        const version = String((promo && promo.actualizada_en) || 'base');
        const rol = api.normalizarRol(sesionActiva.rol);
        const usuario = String(sesionActiva.usuario || 'Invitado').trim();
        const esClienteAutenticado = rol === 'cliente' && usuario !== '' && usuario !== 'Invitado' && sesionActiva.autenticada;
        if (esClienteAutenticado) {
            return {
                almacen: localStorage,
                clave: 'promoReclamada_' + api.PROYECTO_ACTUAL + '_' + usuario + '_' + version
            };
        }
        return {
            almacen: sessionStorage,
            clave: 'promoReclamada_' + api.PROYECTO_ACTUAL + '_invitado_' + version
        };
    }

    function fuePromoReclamada(promo) {
        if (!promo) return false;
        const info = obtenerClaveReclamoPromo(promo);
        try {
            return info.almacen.getItem(info.clave) === '1';
        } catch (err) {
            return false;
        }
    }

    function marcarPromoReclamada(promo) {
        if (!promo) return;
        const info = obtenerClaveReclamoPromo(promo);
        try {
            info.almacen.setItem(info.clave, '1');
        } catch (err) {
        }
    }

    function obtenerFinRelojCliente(promo) {
        if (!promo || promo.activa === false || fuePromoReclamada(promo)) return null;
        const expGlobalMs = new Date(promo.expira_en).getTime();
        if (!Number.isFinite(expGlobalMs) || Date.now() >= expGlobalMs) return null;
        if (esPromoPorVisita(promo)) {
            const minutos = Math.max(1, Number(promo.duracion_minutos) || 15);
            const claveVisita = 'promoVisitaFin_' + api.PROYECTO_ACTUAL + '_' + String(promo.actualizada_en || 'base');
            let finVisitaMs = NaN;
            try {
                const guardado = sessionStorage.getItem(claveVisita);
                if (guardado) finVisitaMs = Number(guardado);
            } catch (err) {
            }
            if (!Number.isFinite(finVisitaMs) || finVisitaMs <= 0) {
                finVisitaMs = Date.now() + (minutos * 60000);
                try {
                    sessionStorage.setItem(claveVisita, String(finVisitaMs));
                } catch (err) {
                }
            }
            return { finMs: Math.min(finVisitaMs, expGlobalMs), totalSeg: minutos * 60, porVisita: true };
        }
        const actMs = new Date(promo.actualizada_en || Date.now()).getTime();
        const duracionRealSeg = Number.isFinite(actMs) && expGlobalMs > actMs
            ? Math.max(60, Math.round((expGlobalMs - actMs) / 1000))
            : Math.max(60, (Number(promo.duracion_minutos) || 15) * 60);
        return { finMs: expGlobalMs, totalSeg: duracionRealSeg, porVisita: false };
    }

    function formatearCuentaRegresiva(totalSeg) {
        const segLimpios = Math.max(0, Math.floor(totalSeg));
        if (segLimpios >= 86400) {
            const dias = Math.floor(segLimpios / 86400);
            const horas = Math.floor((segLimpios % 86400) / 3600);
            const min = Math.floor((segLimpios % 3600) / 60);
            const seg = segLimpios % 60;
            return dias + 'd ' + String(horas).padStart(2, '0') + ':' + String(min).padStart(2, '0') + ':' + String(seg).padStart(2, '0');
        }
        if (segLimpios >= 3600) {
            const horas = Math.floor(segLimpios / 3600);
            const min = Math.floor((segLimpios % 3600) / 60);
            const seg = segLimpios % 60;
            return String(horas).padStart(2, '0') + ':' + String(min).padStart(2, '0') + ':' + String(seg).padStart(2, '0');
        }
        const min = Math.floor(segLimpios / 60);
        const seg = segLimpios % 60;
        return String(min).padStart(2, '0') + ':' + String(seg).padStart(2, '0');
    }

    function actualizarAyudaModoVigencia() {
        const modo = String($('#promoModoVigencia').val() || 'evergreen');
        const esEvergreen = modo === 'evergreen';
        $('#grupoDuracionFlash').prop('hidden', !esEvergreen);
        const textos = {
            evergreen: 'Cada cliente recibe una ventana flash individual al visitar el catalogo sin que la oferta caduque cuando nadie entra.',
            '15m': 'Campana global en tiempo real: caduca exactamente 15 minutos despues de guardar.',
            '24h': 'Campana global en tiempo real: caduca exactamente 24 horas despues de guardar.',
            '7d': 'Campana semanal en tiempo real: caduca exactamente 7 dias despues de guardar.'
        };
        $('#promoModoAyuda').text(textos[modo] || textos.evergreen);
    }

    function sincronizarEstadoBadgeEditor() {
        const $badge = $('#promoEstadoBadge');
        const $meta = $('#promoMetaVigencia');
        if (!$badge.length) return;
        $badge.removeClass('badge-estado--confirmado badge-estado--info badge-estado--pendiente badge-estado--cancelado');
        if (!promoActual) {
            $badge.addClass('badge-estado--pendiente').text('PAUSADA');
            $meta.text('Sin promocion activa registrada.');
            return;
        }
        if (promoActual.activa === false) {
            $badge.addClass('badge-estado--pendiente').text('PAUSADA');
            $meta.text('Pausada manualmente. El banner permanece oculto para los clientes.');
            return;
        }
        const expMs = new Date(promoActual.expira_en).getTime();
        if (!Number.isFinite(expMs) || Date.now() >= expMs) {
            $badge.addClass('badge-estado--cancelado').text('EXPIRADA');
            $meta.text('La vigencia global vencio. Selecciona una nueva vigencia y guarda para reactivarla.');
            return;
        }
        if (esPromoPorVisita(promoActual)) {
            $badge.addClass('badge-estado--confirmado').text('ACTIVA (POR VISITA)');
            $meta.text('Siempre activa: ventana flash de ' + (Number(promoActual.duracion_minutos) || 15) + ' min por cada cliente que visita.');
            return;
        }
        $badge.addClass('badge-estado--info').text('ACTIVA (CAMPANA)');
        $meta.text('Campana en tiempo real vigente hasta ' + new Date(expMs).toLocaleString() + '.');
    }

    function sincronizarEditorPromocion() {
        sincronizarEstadoBadgeEditor();
        if (!promoActual) return;
        const modo = detectarModoVigencia(promoActual);
        $('#promoEditTitulo').val(promoActual.titulo || PROMO_TITULO_DEFECTO);
        $('#promoEditDesc').val(promoActual.descripcion || PROMO_DESC_PUBLICA);
        $('#promoEditPrecio').val(Number(promoActual.precio || PROMO_PRECIO_DEFECTO));
        $('#promoModoVigencia').val(modo);
        $('#promoEditDuracion').val(modo === 'evergreen' ? (Number(promoActual.duracion_minutos) || 15) : 15);
        $('#promoActivaCheck').prop('checked', promoActual.activa !== false);
        actualizarAyudaModoVigencia();
    }

    function actualizarRelojPromocion(notificarSiVence) {
        const banner = document.getElementById('bannerPromoExpress');
        if (!banner) return;
        const reloj = obtenerFinRelojCliente(promoActual);
        if (!reloj) {
            banner.hidden = true;
            return;
        }
        const restanteMs = Math.max(0, reloj.finMs - Date.now());
        if (restanteMs <= 0) {
            const estabaVisible = !banner.hidden;
            banner.hidden = true;
            $('#promoCuentaRegresiva').text('00:00');
            $('#promoBarraTiempo').css('width', '0%');
            sincronizarEstadoBadgeEditor();
            if (notificarSiVence && estabaVisible && !promoExpiracionNotificada && api.normalizarRol(sesionActiva.rol) === 'cliente') {
                promoExpiracionNotificada = true;
                mostrarToast('La promocion express ha finalizado.', 'alerta');
            }
            return;
        }
        const totalSeg = Math.ceil(restanteMs / 1000);
        $('#promoCuentaRegresiva').text(formatearCuentaRegresiva(totalSeg));
        const pct = Math.min(100, Math.max(0, (totalSeg / reloj.totalSeg) * 100));
        $('#promoBarraTiempo').css('width', pct + '%');
    }

    function pintarPromocionExpress() {
        const banner = document.getElementById('bannerPromoExpress');
        if (!banner) return;
        const reloj = obtenerFinRelojCliente(promoActual);
        if (!reloj || reloj.finMs <= Date.now()) {
            banner.hidden = true;
            return;
        }
        const descCruda = String(promoActual.descripcion || '').trim();
        const descFinal = !descCruda ? PROMO_DESC_PUBLICA : descCruda;
        $('#promoTitulo').text(promoActual.titulo || PROMO_TITULO_DEFECTO);
        $('#promoDescripcion').text(descFinal);
        $('#promoPrecio').text(CONFIG_NEGOCIO.moneda + ' ' + Number(promoActual.precio || PROMO_PRECIO_DEFECTO).toFixed(2));
        renderizarDetalleSeguro('#promoDetalleSeguro', '<strong>Stock listo en Cotillones Snoopy</strong> - Arma tu celebracion al mejor precio.');
        banner.hidden = false;
        actualizarRelojPromocion(false);
    }

    async function hidratarPromocion() {
        const cacheLocal = api.obtenerCachePromocion();
        if (cacheLocal) {
            promoActual = cacheLocal;
            pintarPromocionExpress();
            sincronizarEditorPromocion();
        }
        const res = await api.obtenerPromocionActiva();
        if (res && res.ok) {
            if (res.promo) {
                promoActual = res.promo;
            } else if (res.vacia) {
                promoActual = crearPromocionInicialDefecto();
            }
        } else if (!promoActual && res && res.promo) {
            promoActual = res.promo;
        } else if (!promoActual) {
            promoActual = crearPromocionInicialDefecto();
        }
        promoExpiracionNotificada = false;
        pintarPromocionExpress();
        sincronizarEditorPromocion();
    }

    $('#promoModoVigencia').on('change', actualizarAyudaModoVigencia);

    setInterval(() => {
        if (!promoActual) return;
        actualizarRelojPromocion(true);
    }, 1000);

    $('#btnReclamarPromo').on('click', async function () {
        if (!promoActual || fuePromoReclamada(promoActual)) return;
        promoReclamos += 1;
        $('#promoConfirmaciones').text(promoReclamos + ' reclamos');
        marcarPromoReclamada(promoActual);
        const banner = document.getElementById('bannerPromoExpress');
        if (banner) banner.hidden = true;
        agregarAlCarrito({
            id: 'PROMO-EXPRESS',
            nombre: 'Promo: ' + (promoActual.titulo || PROMO_TITULO_DEFECTO),
            precio: Number(promoActual.precio || PROMO_PRECIO_DEFECTO)
        }, true);
        mostrarToast('Oferta Express de fiesta aplicada a tu pedido.', 'exito');
        abrirModalCheckout();
        await api.registrarActividad(sesionActiva.usuario, 'RECLAMO_PROMO', promoActual.titulo || PROMO_TITULO_DEFECTO);
    });

    async function cargarConsultasCliente() {
        const $cont = $('#listaConsultasCliente').empty();
        try {
            const filas = await api.listarTabla('consultas', true, 25);
            if (!filas.length) {
                $cont.append($('<p>').addClass('card-item__meta').text('Aun no hay consultas registradas.'));
                return;
            }
            filas.forEach((c) => {
                const $card = $('<div>').addClass('tarjeta-operativa');
                const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                    .append($('<strong>').text(c.cliente || 'Cliente'))
                    .append($('<span>').addClass('badge-estado badge-estado--' + (c.estado || 'pendiente')).text(c.estado || 'pendiente'));
                $card.append($cab, $('<p>').text(c.mensaje || ''));
                if (c.respuesta) {
                    $card.append($('<p>').addClass('feedback-formulario feedback-formulario--exito').text('Respuesta Cotillones Snoopy: ' + c.respuesta));
                }
                $cont.append($card);
            });
        } catch (err) {
            $cont.append($('<p>').addClass('card-item__meta').text('Sin conexion para actualizar el historial de consultas.'));
        }
    }

    async function cargarPanelPedidosOp() {
        const $cont = $('#listaPedidosOp').empty();
        try {
            const filas = await api.listarTabla('pedidos', true, 50);
            $('#metricaPedidos').text(filas.length);
            const ingresos = filas.filter((p) => p.estado === 'confirmado' || p.estado === 'despachado').reduce((acc, p) => acc + Number(p.monto_total || 0), 0);
            $('#metricaIngresos').text(CONFIG_NEGOCIO.moneda + ' ' + ingresos.toFixed(2));
            if (!filas.length) {
                $cont.append($('<p>').addClass('card-item__meta').text('Sin pedidos entrantes registrados.'));
                return;
            }
            filas.forEach((p) => {
                const est = String(p.estado || 'pendiente').toLowerCase();
                const $card = $('<div>').addClass('tarjeta-operativa');
                const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                    .append($('<strong>').text('#' + p.id + ' - ' + (p.cliente || 'Cliente')))
                    .append($('<span>').addClass('badge-estado badge-estado--' + est).text(est));
                const resumenItems = Array.isArray(p.items) && p.items.length
                    ? p.items.map((it) => (it.nombre || 'Producto') + ' x' + (it.cantidad || 1)).join(', ')
                    : 'Detalle de pedido';
                const $itemsTxt = $('<p>').addClass('card-item__meta').text(resumenItems);
                const $det = $('<p>').addClass('card-item__meta').text((p.modalidad || '') + ' | ' + (p.forma_pago || '') + ' | Total: ' + CONFIG_NEGOCIO.moneda + ' ' + Number(p.monto_total || 0).toFixed(2));
                const $acc = $('<div>').addClass('fila-tactil');
                if (est === 'pendiente') {
                    const $btnConf = $('<button>').attr('type', 'button').addClass('btn-primario').text('Confirmar Pedido').on('click', async () => {
                        await api.actualizarPorId('pedidos', p.id, { estado: 'confirmado' });
                        await api.registrarActividad(sesionActiva.usuario, 'PEDIDO_CONFIRMADO', 'Pedido #' + p.id + ' confirmado');
                        mostrarToast('Pedido #' + p.id + ' confirmado.', 'exito');
                        cargarPanelPedidosOp();
                    });
                    $acc.append($btnConf);
                }
                if (est === 'pendiente' || est === 'confirmado') {
                    const $btnDesp = $('<button>').attr('type', 'button').addClass('btn-secundario').text('Marcar Despachado').on('click', async () => {
                        await api.actualizarPorId('pedidos', p.id, { estado: 'despachado' });
                        await api.registrarActividad(sesionActiva.usuario, 'PEDIDO_DESPACHADO', 'Pedido #' + p.id + ' despachado');
                        mostrarToast('Pedido #' + p.id + ' marcado como despachado.', 'exito');
                        cargarPanelPedidosOp();
                    });
                    $acc.append($btnDesp);
                }
                $card.append($cab, $itemsTxt, $det);
                if ($acc.children().length > 0) {
                    $card.append($acc);
                }
                $cont.append($card);
            });
        } catch (err) {
            $cont.append($('<p>').addClass('card-item__meta').text('No se pudieron consultar los pedidos en este momento.'));
        }
    }

    async function cargarPanelConsultasOp() {
        const $cont = $('#listaConsultasOp').empty();
        try {
            const filas = await api.listarTabla('consultas', true, 50);
            const pendientes = filas.filter((c) => c.estado !== 'respondida').length;
            $('#metricaConsultasPend').text(pendientes);
            if (!filas.length) {
                $cont.append($('<p>').addClass('card-item__meta').text('No existen consultas pendientes.'));
                return;
            }
            filas.forEach((c) => {
                const $card = $('<div>').addClass('tarjeta-operativa');
                const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                    .append($('<strong>').text(c.cliente || 'Cliente'))
                    .append($('<span>').addClass('badge-estado badge-estado--' + (c.estado || 'pendiente')).text(c.estado || 'pendiente'));
                $card.append($cab, $('<p>').text(c.mensaje || ''));
                if (c.estado === 'respondida' && c.respuesta) {
                    $card.append($('<p>').addClass('feedback-formulario feedback-formulario--exito').text('Respondido: ' + c.respuesta));
                } else {
                    const idInput = 'respConsulta_' + c.id;
                    const $lbl = $('<label>').attr('for', idInput).addClass('etiqueta-campo').text('Respuesta de Cotillones Snoopy');
                    const $inp = $('<input>').attr({ type: 'text', id: idInput, placeholder: 'Escribe la respuesta para el cliente...' }).addClass('control-input');
                    const $btn = $('<button>').attr('type', 'button').addClass('btn-primario').text('Responder al Cliente').on('click', async () => {
                        const respTexto = String($inp.val() || '').trim();
                        if (respTexto.length < 4) {
                            mostrarToast('Escribe una respuesta valida.', 'error');
                            return;
                        }
                        await api.actualizarPorId('consultas', c.id, { respuesta: respTexto, estado: 'respondida' });
                        await api.registrarActividad(sesionActiva.usuario, 'RESPUESTA_CONSULTA', 'Respondio consulta #' + c.id);
                        mostrarToast('Respuesta enviada al cliente.', 'exito');
                        cargarPanelConsultasOp();
                    });
                    $card.append($lbl, $('<div>').addClass('fila-tactil').append($inp, $btn));
                }
                $cont.append($card);
            });
        } catch (err) {
            $cont.append($('<p>').addClass('card-item__meta').text('Error al consultar bandeja de consultas.'));
        }
    }

    async function cargarPanelReservasOp() {
        const $cont = $('#listaReservasOp').empty();
        try {
            const filas = await api.listarTabla('reservas', true, 50);
            if (!filas.length) {
                $cont.append($('<p>').addClass('card-item__meta').text('Sin reservas de eventos programadas.'));
                return;
            }
            filas.forEach((r) => {
                const estRes = String(r.estado || 'pendiente').toLowerCase();
                const $card = $('<div>').addClass('tarjeta-operativa');
                const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                    .append($('<strong>').text((r.cliente || 'Cliente') + ' - ' + (r.detalle_sala || r.estacion_codigo || '')))
                    .append($('<span>').addClass('badge-estado badge-estado--' + estRes).text(estRes));
                const $det = $('<p>').addClass('card-item__meta').text('Fecha: ' + (r.fecha_reserva || '') + ' | Horario: ' + (r.horario || ''));
                $card.append($cab, $det);
                if (estRes !== 'confirmado') {
                    const $btnOk = $('<button>').attr('type', 'button').addClass('btn-primario').text('Confirmar Reserva').on('click', async () => {
                        await api.actualizarPorId('reservas', r.id, { estado: 'confirmado' });
                        await api.registrarActividad(sesionActiva.usuario, 'RESERVA_CONFIRMADA', 'Reserva #' + r.id + ' confirmada');
                        mostrarToast('Reserva de evento confirmada.', 'exito');
                        cargarPanelReservasOp();
                    });
                    $card.append($('<div>').addClass('fila-tactil').append($btnOk));
                }
                $cont.append($card);
            });
        } catch (err) {
            $cont.append($('<p>').addClass('card-item__meta').text('Error al cargar reservas.'));
        }
    }

    function renderizarProductosExtraOp() {
        const $cont = $('#listaProductosExtra').empty();
        if (!productosExtraRemotos.length) {
            $cont.append($('<p>').addClass('card-item__meta').text('No hay productos adicionales publicados.'));
            return;
        }
        productosExtraRemotos.forEach((p) => {
            const $card = $('<div>').addClass('tarjeta-operativa');
            const $img = $('<img>')
                .addClass('tarjeta-ods__imagen tarjeta-ods__imagen--foto img-ampliable')
                .attr('src', p.imagen || CATALOGO_RESPALDO[0].portada)
                .attr('alt', 'Foto de ' + (p.nombre || 'producto extra'))
                .attr('loading', 'lazy');
            const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                .append($('<strong>').text(p.nombre + ' (' + CONFIG_NEGOCIO.moneda + ' ' + Number(p.precio || 0).toFixed(2) + ')'))
                .append($('<button>').attr('type', 'button').addClass('btn-peligro').text('Eliminar').on('click', async () => {
                    await api.eliminarPorId('productos_extra', p.id);
                    await api.registrarActividad(sesionActiva.usuario, 'ELIMINAR_PRODUCTO', p.nombre);
                    mostrarToast('Producto eliminado.', 'alerta');
                    await hidratarCatalogoCompleto();
                    renderizarProductosExtraOp();
                }));
            $card.append($img, $cab);
            $cont.append($card);
        });
    }

    $('#prodExtraImagenArchivo').on('change', function () {
        const archivo = this.files && this.files[0];
        if (!archivo) return;
        const lector = new FileReader();
        lector.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const maxW = 480;
                const escala = Math.min(1, maxW / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * escala));
                canvas.height = Math.max(1, Math.round(img.height * escala));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                imagenDataUrlCargada = canvas.toDataURL('image/jpeg', 0.72);
                $('#previewProdExtra').attr('src', imagenDataUrlCargada);
                $('#contenedorPreviewFoto').prop('hidden', false);
            };
            img.src = String(ev.target.result || '');
        };
        lector.readAsDataURL(archivo);
    });

    $('#prodExtraImagenUrl').on('input', function () {
        const u = String($(this).val() || '').trim();
        if (u.startsWith('http://') || u.startsWith('https://')) {
            $('#previewProdExtra').attr('src', u);
            $('#contenedorPreviewFoto').prop('hidden', false);
        }
    });

    $('#formProductoExtra').on('submit', async function (e) {
        e.preventDefault();
        const nombre = String($('#prodExtraNombre').val() || '').trim();
        const categoria = String($('#prodExtraCategoria').val() || 'Velas y Toppers');
        const precio = Number($('#prodExtraPrecio').val() || 0);
        const urlImg = String($('#prodExtraImagenUrl').val() || '').trim();
        const imagenFinal = imagenDataUrlCargada || urlImg || CATALOGO_RESPALDO[0].portada;
        if (nombre.length < 3 || precio <= 0) {
            $('#feedbackProdExtra').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text('Completa nombre y precio validos.').prop('hidden', false);
            return;
        }
        await api.insertarRegistro('productos_extra', { nombre: nombre, categoria: categoria, precio: precio, imagen: imagenFinal });
        await api.registrarActividad(sesionActiva.usuario, 'NUEVO_PRODUCTO', nombre + ' (' + CONFIG_NEGOCIO.moneda + ' ' + precio.toFixed(2) + ')');
        imagenDataUrlCargada = '';
        $('#contenedorPreviewFoto').prop('hidden', true);
        this.reset();
        $('#feedbackProdExtra').removeClass('feedback-formulario--error').addClass('feedback-formulario--exito').text('Producto publicado en el catalogo de fiesta con exito.').prop('hidden', false);
        await hidratarCatalogoCompleto();
        renderizarProductosExtraOp();
    });

    $('#formPromoExpress').on('submit', async function (e) {
        e.preventDefault();
        const titulo = String($('#promoEditTitulo').val() || '').trim();
        const descripcion = String($('#promoEditDesc').val() || '').trim() || PROMO_DESC_PUBLICA;
        const precio = Number($('#promoEditPrecio').val() || PROMO_PRECIO_DEFECTO);
        const modo = String($('#promoModoVigencia').val() || 'evergreen');
        const ahoraMs = Date.now();
        let duracionMinutos = Math.max(1, parseInt($('#promoEditDuracion').val(), 10) || 15);
        let expiraMs = ahoraMs + 365 * 24 * 60 * 60 * 1000;
        if (modo === '15m') {
            duracionMinutos = 15;
            expiraMs = ahoraMs + 15 * 60 * 1000;
        } else if (modo === '24h') {
            duracionMinutos = 1440;
            expiraMs = ahoraMs + 24 * 60 * 60 * 1000;
        } else if (modo === '7d') {
            duracionMinutos = 10080;
            expiraMs = ahoraMs + 7 * 24 * 60 * 60 * 1000;
        }
        const datos = {
            titulo: titulo,
            descripcion: descripcion,
            precio: precio,
            duracion_minutos: duracionMinutos,
            expira_en: new Date(expiraMs).toISOString(),
            activa: $('#promoActivaCheck').is(':checked'),
            actualizada_por: sesionActiva.usuario
        };
        if (datos.titulo.length < 3 || datos.precio <= 0) {
            $('#feedbackPromoOp').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text('Ingresa un titulo y precio validos.').prop('hidden', false);
            return;
        }
        const res = await api.guardarPromocion(datos);
        if (res.ok && res.data) {
            promoActual = res.data;
            promoExpiracionNotificada = false;
            pintarPromocionExpress();
            sincronizarEditorPromocion();
            await api.registrarActividad(sesionActiva.usuario, 'EDITAR_PROMO', datos.titulo + ' (' + modo + ')');
            $('#feedbackPromoOp').removeClass('feedback-formulario--error').addClass('feedback-formulario--exito').text('Promocion actualizada con exito.').prop('hidden', false);
        } else {
            $('#feedbackPromoOp').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text('No se pudo actualizar la promocion: ' + (res.error || '')).prop('hidden', false);
        }
    });

    async function cargarPanelAdminControl() {
        const $act = $('#listaActividadClientes').empty();
        const $cuentas = $('#listaCuentasInternas').empty();
        try {
            const eventos = await api.listarTabla('actividad_clientes', true, 40);
            if (!eventos.length) {
                $act.append($('<p>').addClass('card-item__meta').text('Sin actividad registrada aun.'));
            } else {
                eventos.forEach((ev) => {
                    $act.append($('<div>').addClass('fila-cola-item').append($('<span>').addClass('titulo-truncado').text('[' + (ev.accion || 'EVENTO') + '] ' + (ev.cliente || '') + ' - ' + (ev.detalle || ''))));
                });
            }
        } catch (err) {
            $act.append($('<p>').addClass('card-item__meta').text('No se pudo consultar la actividad reciente.'));
        }
        try {
            const cuentas = await api.listarTabla('cuentas', true, 50);
            cuentas.forEach((c) => {
                $cuentas.append($('<li>').addClass('fila-cola-item').append($('<span>').addClass('titulo-truncado').text(c.usuario)).append($('<span>').addClass('badge-estado badge-estado--confirmado').text(c.rol)));
            });
        } catch (err) {
            $cuentas.append($('<li>').addClass('card-item__meta').text('No se pudo leer cuentas internas.'));
        }
    }

    $('#formNuevaCuentaInterna').on('submit', async function (e) {
        e.preventDefault();
        const usuario = String($('#adminNuevoUsuario').val() || '').trim();
        const clave = String($('#adminNuevaClave').val() || '').trim();
        const rol = String($('#adminNuevoRol').val() || 'encargado');
        if (usuario.length < 3 || clave.length < 6) {
            $('#feedbackCuentaInterna').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text('Usuario (min 3) y clave (min 6) requeridos.').prop('hidden', false);
            return;
        }
        const res = await api.registrarCuenta(usuario, clave, rol);
        $('#feedbackCuentaInterna')
            .removeClass('feedback-formulario--error feedback-formulario--exito')
            .addClass(res.ok ? 'feedback-formulario--exito' : 'feedback-formulario--error')
            .text(res.ok ? 'Cuenta interna creada.' : ('Error: ' + (res.error || 'No se pudo registrar')))
            .prop('hidden', false);
        if (res.ok) {
            this.reset();
            cargarPanelAdminControl();
        }
    });

    $('#btnRefrescarPedidos').on('click', cargarPanelPedidosOp);
    $('#btnRefrescarConsultas').on('click', cargarPanelConsultasOp);
    $('#btnRefrescarReservas').on('click', cargarPanelReservasOp);
    $('#btnRefrescarActividad').on('click', cargarPanelAdminControl);
    $('#btnLimpiarBitacora').on('click', () => $('#listaBitacoraDom').empty());
    $('#btnPurgarActividadRemota').on('click', async () => {
        await api.purgarActividadProyecto().catch(() => {});
        mostrarToast('Actividad remota purgada.', 'alerta');
        cargarPanelAdminControl();
    });

    function abrirModalRegistroCliente() {
        cerrarModalCheckout();
        $('.btn-subtab[data-grupo="acceso"]').removeClass('btn-subtab--activo');
        $('.btn-subtab[data-grupo="acceso"][data-subtab="subtab-registro"]').addClass('btn-subtab--activo');
        $('.panel-subtab[data-grupo="acceso"]').each(function () {
            this.hidden = this.id !== 'subtab-registro';
        });
        sincronizarUiSesionModal();
        $('#feedbackAcceso').prop('hidden', true);
        $('#modalAcceso').prop('hidden', false);
        $('#regUsuario').trigger('focus');
    }

    $(document).on('click', '.btn-abrir-registro-rapido', abrirModalRegistroCliente);

    $('#btnAbrirAcceso').on('click', () => {
        sincronizarUiSesionModal();
        $('#feedbackAcceso').prop('hidden', true);
        $('#modalAcceso').prop('hidden', false);
    });
    $('#btnCerrarAcceso').on('click', () => $('#modalAcceso').prop('hidden', true));

    $('#formLogin').on('submit', async function (e) {
        e.preventDefault();
        const $campoUsuario = $('#loginUsuario');
        const $campoClave = $('#loginClave');
        limpiarErrorCampo($campoUsuario);
        limpiarErrorCampo($campoClave);
        $('#feedbackAcceso').prop('hidden', true);

        const usuario = String($campoUsuario.val() || '').trim();
        const clave = String($campoClave.val() || '').trim();
        const valLogin = validarTextoEnVivo(usuario, 'usuario');
        if (!valLogin.valido) {
            mostrarErrorCampo($campoUsuario, valLogin.error);
            actualizarEstadoBotonFormulario('login');
            return;
        }
        if (clave.length < 4) {
            mostrarErrorCampo($campoClave, 'Ingresa tu clave de acceso.');
            actualizarEstadoBotonFormulario('login');
            return;
        }
        const res = await api.iniciarSesionCuenta(usuario, clave);
        if (!res.ok) {
            $('#feedbackAcceso').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text(res.error || 'Credenciales invalidas.').prop('hidden', false);
            return;
        }
        sesionActiva = api.guardarSesion(res.cuenta);
        this.reset();
        limpiarErrorCampo($campoUsuario);
        limpiarErrorCampo($campoClave);
        actualizarEstadoBotonFormulario('login');
        $('#modalAcceso').prop('hidden', true);
        aplicarPermisosPorRol();
        mostrarToast('Bienvenido ' + sesionActiva.usuario + ' (' + sesionActiva.rol + ').', 'exito');
    });

    $('#formRegistroCliente').on('submit', async function (e) {
        e.preventDefault();
        const $campoRegNombre = $('#regNombreCompleto');
        const $campoRegUsuario = $('#regUsuario');
        const $campoRegClave = $('#regClave');
        limpiarErrorCampo($campoRegNombre);
        limpiarErrorCampo($campoRegUsuario);
        limpiarErrorCampo($campoRegClave);
        $('#feedbackAcceso').prop('hidden', true);

        const nombreCompleto = String($campoRegNombre.val() || '').trim();
        const usuario = String($campoRegUsuario.val() || '').trim();
        const clave = String($campoRegClave.val() || '').trim();
        const valNombreReg = validarTextoEnVivo(nombreCompleto, 'nombre');
        if (!valNombreReg.valido) {
            mostrarErrorCampo($campoRegNombre, valNombreReg.error);
            actualizarEstadoBotonFormulario('registro');
            return;
        }
        const valReg = validarTextoEnVivo(usuario, 'usuario');
        if (!valReg.valido) {
            mostrarErrorCampo($campoRegUsuario, valReg.error);
            actualizarEstadoBotonFormulario('registro');
            return;
        }
        if (clave.length < 6) {
            mostrarErrorCampo($campoRegClave, 'Crea una clave de al menos 6 caracteres.');
            actualizarEstadoBotonFormulario('registro');
            return;
        }
        const res = await api.registrarCuenta(usuario, clave, 'cliente');
        if (!res.ok) {
            $('#feedbackAcceso').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text(res.error || 'No se pudo crear la cuenta.').prop('hidden', false);
            return;
        }
        sesionActiva = api.guardarSesion({ usuario: usuario, rol: 'cliente', autenticada: true });
        if (promoActual && promoActual.actualizada_en) {
            try {
                sessionStorage.removeItem('promoVisitaFin_' + api.PROYECTO_ACTUAL + '_' + String(promoActual.actualizada_en));
            } catch (err) {
            }
        }
        this.reset();
        limpiarErrorCampo($campoRegNombre);
        limpiarErrorCampo($campoRegUsuario);
        limpiarErrorCampo($campoRegClave);
        actualizarEstadoBotonFormulario('registro');
        $('#modalAcceso').prop('hidden', true);
        aplicarPermisosPorRol();
        mostrarToast('Cuenta creada con exito. Bienvenido ' + usuario + '!', 'exito');
    });

    $('#btnCerrarSesion').on('click', function () {
        sesionActiva = api.cerrarSesion();
        $('#modalAcceso').prop('hidden', true);
        aplicarPermisosPorRol();
        mostrarToast('Sesion cerrada.', 'alerta');
    });

    // Semana 3 - Backend Supabase
    async function hidratarCatalogoCompleto() {
        let base = CATALOGO_RESPALDO.slice();
        try {
            const resp = await fetch(CONFIG_NEGOCIO.catalogoUrl, { cache: 'no-cache' });
            if (resp.ok) {
                const json = await resp.json();
                if (Array.isArray(json) && json.length >= CATALOGO_RESPALDO.length) {
                    base = json;
                }
            }
        } catch (err) {
            try {
                const respFallback = await fetch(CONFIG_NEGOCIO.catalogoUrl);
                if (respFallback.ok) {
                    const jsonFallback = await respFallback.json();
                    if (Array.isArray(jsonFallback) && jsonFallback.length >= CATALOGO_RESPALDO.length) {
                        base = jsonFallback;
                    }
                }
            } catch (err2) {
            }
        }
        catalogoBase = base;
        productosExtraRemotos = await api.listarProductosExtraConCache();
        const mapeadosExtras = productosExtraRemotos.map((e, i) => ({
            id: 'EXT-' + (e.id || (i + 1)),
            sku: 'EXT-' + (e.id || (i + 1)),
            orden: 500 + i,
            nombre: e.nombre || 'Producto Extra de Fiesta',
            alt: 'Fotografia de ' + (e.nombre || 'Producto Extra de Fiesta'),
            categoria: e.categoria || 'Velas y Toppers',
            subcategoria: 'Novedades',
            tematica: e.nombre || 'Novedad de fiesta',
            presentacion: 'Catalogo ampliado en linea',
            precio: Number(e.precio || 0),
            stock: 50,
            descripcion: 'Producto publicado desde el panel de tienda.',
            fichaTecnica: 'Registro incorporado por el equipo de Cotillones Snoopy.',
            portada: e.imagen || CATALOGO_RESPALDO[0].portada
        }));
        catalogoPrincipal = catalogoBase.concat(mapeadosExtras);
        catalogoCompleto = catalogoPrincipal.concat(PAQUETES_RECOMENDADOS);
        $('#metricaProductosActivos').text(catalogoPrincipal.length);
        renderizarTarjetasCatalogo();
        renderizarFranjaPaquetes();
    }

    async function hidratarDatosSegunRol() {
        const rol = api.normalizarRol(sesionActiva.rol);
        if (rol === 'cliente') {
            await cargarConsultasCliente();
        } else {
            await Promise.all([
                cargarPanelPedidosOp(),
                cargarPanelConsultasOp(),
                cargarPanelReservasOp(),
                hidratarPromocion()
            ]);
            renderizarProductosExtraOp();
            sincronizarEditorPromocion();
            if (rol === 'admin') {
                await cargarPanelAdminControl();
            }
        }
    }

    async function hidratarEstadoAplicacion() {
        actualizarEstadoRedYAvisoOffline();
        renderizarCarrito();
        await Promise.all([
            hidratarPromocion(),
            hidratarCatalogoCompleto()
        ]);
        aplicarPermisosPorRol();
        if (navigator.onLine) {
            const resSync = await api.sincronizarColaFifo();
            actualizarEstadoRedYAvisoOffline();
            if (resSync.procesados > 0) {
                registrarBitacoraDom('SYNC_FIFO', resSync.procesados + ' registros sincronizados con el servidor.');
                mostrarToast('Cola FIFO sincronizada automaticamente (' + resSync.procesados + ').', 'exito');
            }
        }
        registrarBitacoraDom('SISTEMA', 'Aplicacion hidratada para proyecto ' + CONFIG_NEGOCIO.proyecto);
    }

    hidratarEstadoAplicacion();
});
