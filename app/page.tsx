"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Instrumento = {
  id: number;
  persona: string;
  instrumento: string;
  nro_parte: string;
  nro_serie: string;
  foto: string;
  created_at: string;
};

type Formulario = Omit<Instrumento, "id" | "created_at">;

const formularioVacio: Formulario = {
  persona: "",
  instrumento: "",
  nro_parte: "",
  nro_serie: "",
  foto: "",
};

const TAMANO_MAXIMO_FOTO = 2 * 1024 * 1024;

function mensajeDeError(payload: unknown, predeterminado: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return predeterminado;
}

function leerFoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("No se pudo leer la imagen."));
    };
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([]);
  const [formulario, setFormulario] = useState<Formulario>(formularioVacio);
  const [idEditando, setIdEditando] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const obtenerInstrumentos = useCallback(async () => {
    const response = await fetch("/api/instrumentos");
    const payload: unknown = await response.json();

    if (!response.ok) {
      throw new Error(mensajeDeError(payload, "No se pudieron cargar los datos."));
    }
    if (!Array.isArray(payload)) {
      throw new Error("La respuesta de la API no tiene el formato esperado.");
    }

    return payload as Instrumento[];
  }, []);

  const cargarInstrumentos = useCallback(async () => {
    setCargando(true);
    setError("");

    try {
      setInstrumentos(await obtenerInstrumentos());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los datos.");
    } finally {
      setCargando(false);
    }
  }, [obtenerInstrumentos]);

  useEffect(() => {
    let cancelado = false;
    obtenerInstrumentos()
      .then((items) => {
        if (!cancelado) setInstrumentos(items);
      })
      .catch((cause: unknown) => {
        if (!cancelado) {
          setError(cause instanceof Error ? cause.message : "No se pudieron cargar los datos.");
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [obtenerInstrumentos]);

  const instrumentosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase();
    if (!termino) return instrumentos;

    return instrumentos.filter((item) =>
      [item.persona, item.instrumento, item.nro_parte, item.nro_serie]
        .join(" ")
        .toLocaleLowerCase()
        .includes(termino),
    );
  }, [busqueda, instrumentos]);

  function actualizarCampo(campo: keyof Formulario, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  async function seleccionarFoto(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("La foto debe estar en formato JPG, PNG o WebP.");
      return;
    }
    if (file.size > TAMANO_MAXIMO_FOTO) {
      setError("La foto no puede superar los 2 MB.");
      return;
    }

    try {
      const foto = await leerFoto(file);
      setFormulario((actual) => ({ ...actual, foto }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo leer la imagen.");
    }
  }

  function cancelarEdicion() {
    setIdEditando(null);
    setFormulario(formularioVacio);
    setError("");
    setAviso("");
  }

  function editar(item: Instrumento) {
    setIdEditando(item.id);
    setFormulario({
      persona: item.persona,
      instrumento: item.instrumento,
      nro_parte: item.nro_parte,
      nro_serie: item.nro_serie,
      foto: item.foto,
    });
    setError("");
    setAviso("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAviso("");

    if (!formulario.foto) {
      setError("Selecciona una foto del instrumento.");
      return;
    }

    setGuardando(true);
    try {
      const response = await fetch("/api/instrumentos", {
        method: idEditando === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          idEditando === null ? formulario : { ...formulario, id: idEditando },
        ),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(mensajeDeError(payload, "No se pudo guardar el instrumento."));
      }

      cancelarEdicion();
      setAviso(idEditando === null ? "Instrumento registrado." : "Cambios guardados.");
      await cargarInstrumentos();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el instrumento.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(item: Instrumento) {
    if (!window.confirm(`¿Eliminar el instrumento "${item.instrumento}"?`)) return;

    setError("");
    setAviso("");
    try {
      const response = await fetch(`/api/instrumentos?id=${item.id}`, {
        method: "DELETE",
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(mensajeDeError(payload, "No se pudo eliminar el instrumento."));
      }

      if (idEditando === item.id) cancelarEdicion();
      setAviso("Instrumento eliminado.");
      await cargarInstrumentos();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el instrumento.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] px-4 py-8 text-slate-900 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
              Registro técnico
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Instrumentos aeronáuticos
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Inventario de instrumentos y sus datos de identificación.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Instrumentos registrados
            </p>
            <p className="mt-1 text-2xl font-semibold">{instrumentos.length}</p>
          </div>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold">
                {idEditando === null ? "Registrar instrumento" : "Editar instrumento"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Completa los datos de identificación.
              </p>
            </div>

            <form className="space-y-4" onSubmit={guardar}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Persona que carga el dato</span>
                <input
                  required
                  maxLength={120}
                  value={formulario.persona}
                  onChange={(event) => actualizarCampo("persona", event.target.value)}
                  placeholder="Nombre y apellido"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Nombre del instrumento</span>
                <input
                  required
                  maxLength={150}
                  value={formulario.instrumento}
                  onChange={(event) => actualizarCampo("instrumento", event.target.value)}
                  placeholder="Ej.: altímetro"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Nro. de parte</span>
                  <input
                    required
                    maxLength={100}
                    value={formulario.nro_parte}
                    onChange={(event) => actualizarCampo("nro_parte", event.target.value)}
                    placeholder="Nro. de parte"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Nro. de serie</span>
                  <input
                    required
                    maxLength={100}
                    value={formulario.nro_serie}
                    onChange={(event) => actualizarCampo("nro_serie", event.target.value)}
                    placeholder="Nro. de serie"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium">Foto del instrumento</span>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center transition hover:border-blue-500 hover:bg-blue-50/50">
                  {formulario.foto ? (
                    <Image
                      src={formulario.foto}
                      alt="Vista previa del instrumento"
                      width={128}
                      height={96}
                      unoptimized
                      className="mb-3 h-24 w-32 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="mb-2 text-2xl text-blue-700" aria-hidden="true">
                      +
                    </span>
                  )}
                  <span className="text-sm font-medium text-slate-700">
                    {formulario.foto ? "Cambiar foto" : "Seleccionar una foto"}
                  </span>
                  <span className="mt-1 text-xs text-slate-500">JPG, PNG o WebP · máximo 2 MB</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => void seleccionarFoto(event.target.files?.[0])}
                  />
                </label>
              </div>

              {error && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              {aviso && (
                <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                  {aviso}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {guardando ? "Guardando..." : idEditando === null ? "Guardar instrumento" : "Guardar cambios"}
                </button>
                {idEditando !== null && (
                  <button
                    type="button"
                    onClick={cancelarEdicion}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </section>

          <section>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Inventario</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {instrumentosFiltrados.length}{" "}
                  {instrumentosFiltrados.length === 1 ? "registro" : "registros"}
                </p>
              </div>
              <input
                type="search"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar por nombre, parte o serie..."
                aria-label="Buscar instrumentos"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:max-w-xs"
              />
            </div>

            {cargando ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                Cargando instrumentos...
              </div>
            ) : instrumentosFiltrados.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <p className="font-medium text-slate-700">
                  {busqueda ? "No se encontraron resultados" : "Todavía no hay instrumentos"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {busqueda
                    ? "Prueba con otro término de búsqueda."
                    : "Completa el formulario para crear el primer registro."}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {instrumentosFiltrados.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
                  >
                    <Image
                      src={item.foto}
                      alt={`Foto de ${item.instrumento}`}
                      width={96}
                      height={96}
                      unoptimized
                      className="h-24 w-full rounded-xl bg-slate-100 object-cover sm:w-24"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">{item.instrumento}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Parte: <span className="text-slate-700">{item.nro_parte}</span>
                        <span className="mx-2 text-slate-300">|</span>
                        Serie: <span className="text-slate-700">{item.nro_serie}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Cargado por {item.persona}</p>
                    </div>
                    <div className="flex shrink-0 gap-2 sm:flex-col">
                      <button
                        type="button"
                        onClick={() => editar(item)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void eliminar(item)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
