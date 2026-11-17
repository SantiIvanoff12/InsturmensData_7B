import { Pool } from "pg";

const TAMANO_MAXIMO_FOTO = 2 * 1024 * 1024;
const FOTO_BASE64 = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

type DatosInstrumento = {
  persona: string;
  instrumento: string;
  nro_parte: string;
  nro_serie: string;
  foto: string;
};

declare global {
  var __supabasePgPool: Pool | undefined;
}

function obtenerPool(): Pool {
  const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta configurar POSTGRES_URL o DATABASE_URL.");
  }

  if (!globalThis.__supabasePgPool) {
    const necesitaSsl =
      connectionString.includes("supabase.co") ||
      connectionString.includes("pooler.supabase.com") ||
      connectionString.includes("sslmode=require");

    globalThis.__supabasePgPool = new Pool({
      connectionString,
      ssl: necesitaSsl ? { rejectUnauthorized: false } : undefined,
    });
  }

  return globalThis.__supabasePgPool;
}

let inicializacionTabla: Promise<void> | null = null;

function asegurarTabla(): Promise<void> {
  if (!inicializacionTabla) {
    inicializacionTabla = obtenerPool()
      .query(`
        CREATE TABLE IF NOT EXISTS instrumentos (
          id SERIAL PRIMARY KEY,
          persona VARCHAR(120) NOT NULL,
          instrumento VARCHAR(150) NOT NULL,
          nro_parte VARCHAR(100) NOT NULL,
          nro_serie VARCHAR(100) NOT NULL,
          foto TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined)
      .catch((cause: unknown) => {
        inicializacionTabla = null;
        throw cause;
      });
  }

  return inicializacionTabla;
}

function esFotoValida(foto: unknown): foto is string {
  if (typeof foto !== "string") return false;
  const match = FOTO_BASE64.exec(foto);
  if (!match) return false;

  const bytes = Buffer.from(match[1], "base64");
  return bytes.length > 0 && bytes.length <= TAMANO_MAXIMO_FOTO;
}

function validarDatos(body: Record<string, unknown>): DatosInstrumento | null {
  const persona = typeof body.persona === "string" ? body.persona.trim() : "";
  const instrumento = typeof body.instrumento === "string" ? body.instrumento.trim() : "";
  const nro_parte = typeof body.nro_parte === "string" ? body.nro_parte.trim() : "";
  const nro_serie = typeof body.nro_serie === "string" ? body.nro_serie.trim() : "";

  if (
    !persona ||
    persona.length > 120 ||
    !instrumento ||
    instrumento.length > 150 ||
    !nro_parte ||
    nro_parte.length > 100 ||
    !nro_serie ||
    nro_serie.length > 100 ||
    !esFotoValida(body.foto)
  ) {
    return null;
  }

  return { persona, instrumento, nro_parte, nro_serie, foto: body.foto };
}

async function leerBody(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      body: null,
      response: Response.json(
        { error: "El cuerpo de la solicitud debe ser JSON válido." },
        { status: 400 },
      ),
    };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      body: null,
      response: Response.json({ error: "El cuerpo de la solicitud no es válido." }, { status: 400 }),
    };
  }

  return { body: body as Record<string, unknown>, response: null };
}

function errorInterno(cause: unknown) {
  console.error("Error en la API de instrumentos:", cause);
  const message =
    cause instanceof Error && cause.message.startsWith("Falta configurar")
      ? cause.message
      : "No se pudo completar la operación. Revisa la conexión y los logs de Postgres.";

  return Response.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    await asegurarTabla();
    const pool = obtenerPool();
    const { rows } = await pool.query(`
      SELECT id, persona, instrumento, nro_parte, nro_serie, foto, created_at
      FROM instrumentos
      ORDER BY id DESC
    `);

    return Response.json(rows);
  } catch (cause) {
    return errorInterno(cause);
  }
}

export async function POST(request: Request) {
  const parsed = await leerBody(request);
  if (parsed.response) return parsed.response;

  const datos = validarDatos(parsed.body);
  if (!datos) {
    return Response.json(
      {
        error:
          "Completa todos los campos y carga una imagen JPG, PNG o WebP válida de hasta 2 MB.",
      },
      { status: 400 },
    );
  }

  try {
    await asegurarTabla();
    const pool = obtenerPool();
    const { rows } = await pool.query(
      `
        INSERT INTO instrumentos (persona, instrumento, nro_parte, nro_serie, foto)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, persona, instrumento, nro_parte, nro_serie, foto, created_at
      `,
      [datos.persona, datos.instrumento, datos.nro_parte, datos.nro_serie, datos.foto],
    );

    return Response.json(rows[0], { status: 201 });
  } catch (cause) {
    return errorInterno(cause);
  }
}

export async function PUT(request: Request) {
  const parsed = await leerBody(request);
  if (parsed.response) return parsed.response;

  const id = Number(parsed.body.id);
  const datos = validarDatos(parsed.body);
  if (!Number.isSafeInteger(id) || id < 1 || !datos) {
    return Response.json(
      {
        error:
          "Indica un ID válido y completa todos los campos con una imagen JPG, PNG o WebP de hasta 2 MB.",
      },
      { status: 400 },
    );
  }

  try {
    await asegurarTabla();
    const pool = obtenerPool();
    const { rows } = await pool.query(
      `
        UPDATE instrumentos
        SET persona = $1,
            instrumento = $2,
            nro_parte = $3,
            nro_serie = $4,
            foto = $5
        WHERE id = $6
        RETURNING id, persona, instrumento, nro_parte, nro_serie, foto, created_at
      `,
      [datos.persona, datos.instrumento, datos.nro_parte, datos.nro_serie, datos.foto, id],
    );

    if (!rows[0]) {
      return Response.json(
        { error: "No se encontró el instrumento solicitado." },
        { status: 404 },
      );
    }

    return Response.json(rows[0]);
  } catch (cause) {
    return errorInterno(cause);
  }
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) {
    return Response.json({ error: "Indica un ID válido para eliminar." }, { status: 400 });
  }

  try {
    await asegurarTabla();
    const pool = obtenerPool();
    const { rows } = await pool.query(
      `
        DELETE FROM instrumentos
        WHERE id = $1
        RETURNING id
      `,
      [id],
    );

    if (!rows[0]) {
      return Response.json(
        { error: "No se encontró el instrumento solicitado." },
        { status: 404 },
      );
    }

    return Response.json({ id: rows[0].id });
  } catch (cause) {
    return errorInterno(cause);
  }
}