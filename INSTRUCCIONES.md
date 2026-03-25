# INSTRUCCIONES DE INTEGRACIÓN — MÓDULOS FISCALITO
# Fecha: 2026-03-25

## ARQUITECTURA MODULAR

La app se divide en archivos separados para mantenerla limpia y mantenible:

```
proyecto/
├── index.html              ← Shell principal (HTML + CSS + estructura)
├── js/
│   ├── mod-escritos.js     ← Módulo: Escritos Judiciales
│   ├── mod-transcripcion.js← Módulo: F11 Transcripción de Actas
│   ├── mod-biblioteca.js   ← Módulo: Biblioteca de Referencia
│   ├── mod-parrafos.js     ← Módulo: Párrafos Modelo F7
│   └── mod-ley21369.js     ← Módulo: Ley 21.369 (ya existente)
├── netlify/
│   └── functions/
│       ├── chat.js         ← Función principal de chat (ya existente)
│       └── ley21369-chat.js← Chat IA Ley 21.369 (ya existente)
└── drive-client.js         ← Cliente Drive (ya existente)
```

## PASO 1 — Copiar archivos JS

Copia los archivos de la carpeta `js/` al directorio `js/` en tu proyecto.

## PASO 2 — Agregar en index.html

Agrega estos `<script>` ANTES del cierre de `</body>`, DESPUÉS de `<script src="/drive-client.js">`:

```html
<!-- Módulos Fiscalito -->
<script src="/js/mod-escritos.js"></script>
<script src="/js/mod-transcripcion.js"></script>
<script src="/js/mod-biblioteca.js"></script>
<script src="/js/mod-parrafos.js"></script>
```

Si ya tienes `mod-ley21369.js`:
```html
<script src="/js/mod-ley21369.js"></script>
```

## PASO 3 — Agregar vistas HTML en index.html

Busca `<!-- WELCOME -->` o la línea `<div class="view active welcome-view" id="viewWelcome">` 
y agrega ANTES de ella:

```html
<!-- ESCRITOS JUDICIALES VIEW -->
<div class="view" id="viewEscritosJudiciales" style="flex-direction:column;overflow:hidden;">
  <div style="padding:14px 20px 8px;border-bottom:1px solid var(--border);background:var(--surface)">
    <div style="font-family:'EB Garamond',serif;font-size:22px;font-weight:400">Escritos Judiciales</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Genera escritos judiciales con IA basados en los modelos de la biblioteca</div>
  </div>
  <div style="flex:1;overflow:hidden" id="escritosContainer"></div>
</div>

<!-- BIBLIOTECA DE REFERENCIA VIEW -->
<div class="view" id="viewBiblioteca" style="flex-direction:column;overflow:hidden;">
  <div id="bibliotecaContainer" style="flex:1;display:flex;flex-direction:column;overflow:hidden;"></div>
</div>
```

## PASO 4 — Actualizar sidebar

### 4a. ESCRITOS JUDICIALES (ya en sidebar)
Busca el item de "Escritos Judiciales" en el sidebar y asegúrate que tenga:
```html
onclick="openEscritosJudiciales()"
```

### 4b. BIBLIOTECA DE REFERENCIA (ya en sidebar)
Busca el item de "Biblioteca de Refer..." y asegúrate que tenga:
```html
onclick="openBibliotecaRef()"
```

### 4c. F11 TRANSCRIPCIÓN (en Funciones IA)
El módulo mod-transcripcion.js se inyecta automáticamente en el panel F11.
Solo asegúrate de que F11 siga siendo "Transcripción" en el array FNS:
```javascript
{code:'F11', name:'Transcripción de Actas', desc:'Transcripción y estructuración de declaraciones'}
```

### 4d. PÁRRAFOS MODELO (F7)
El módulo mod-parrafos.js agrega automáticamente un botón "Párrafos Modelo" 
al final del panel F7. No requiere cambios adicionales.

También actualiza el link del sidebar para "Párrafos Tipo":
```html
onclick="openBiblioteca('parrafos')"  ← ya está así en el código original
```

## PASO 5 — Actualizar FNS array en index.html

Cambia F11 de "Perspectiva de Género" a "Transcripción de Actas":
```javascript
{code:'F11', name:'Transcripción de Actas', 
 desc:'Transcripción automática de declaraciones con diarización y estructuración como acta formal'},
```

## PASO 6 — Supabase Storage

Crea estos buckets en Supabase → Storage si no existen:
- `reference-books` (para la Biblioteca de Referencia)

## PASO 7 — Variables de entorno (opcional, para transcripción automática)

Si quieres transcripción automática con ElevenLabs, configura en Supabase:
- `ELEVENLABS_API_KEY` → clave de ElevenLabs scribe_v2

Sin esta clave, el módulo usa Claude como fallback.

---

## NOTAS IMPORTANTES

- **Todos los módulos son independientes** — si uno falla, los demás siguen funcionando
- **Los módulos usan `sb` (variable global)** — asegúrate de que sea accesible
- **`CHAT_ENDPOINT`** debe estar definido antes de cargar los módulos
- **`showToast()`, `md()`, `escHtml()`** deben estar en el scope global (ya están en core)
- Los módulos inyectan su CSS automáticamente al cargarse

## FUNCIONES EXPUESTAS (llamadas desde HTML)

| Función                    | Módulo           | Descripción |
|---------------------------|------------------|-------------|
| `openEscritosJudiciales()` | mod-escritos     | Abre vista escritos |
| `openBibliotecaRef()`      | mod-biblioteca   | Abre biblioteca |
| `openBiblioteca('parrafos')` | mod-parrafos   | Abre párrafos |
| `openLey21369()`           | mod-ley21369     | Abre Ley 21.369 |

