import { useState, useEffect } from "react";
import "./RegistrarCompraProveedor.css";

const API_URL = "http://localhost:3001/api";

export default function RegistrarCompraProveedor() {
    const [proveedores, setProveedores] = useState([]);
    const [compras, setCompras] = useState([]);
    const [formData, setFormData] = useState({
        id_proveedor: "",
        numero_comprobante: "",
        fecha_compra: new Date().toISOString().split("T")[0],
        monto_total: "",
        observaciones: "",
    });
    const [mensaje, setMensaje] = useState({ tipo: "", texto: "" });
    const [cargando, setCargando] = useState(false);

    const cargarDatos = async () => {
        try {
            const [resProv, resCompras] = await Promise.all([
                fetch(`${API_URL}/proveedores`),
                fetch(`${API_URL}/compras-proveedores`),
            ]);
            if (resProv.ok) setProveedores(await resProv.json());
            if (resCompras.ok) setCompras(await resCompras.json());
        } catch (error) {
            setMensaje({
                tipo: "error",
                texto: "No se pudo conectar con el servidor para obtener los datos.",
            });
        }
    };

    useEffect(() => {
        cargarDatos();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMensaje({ tipo: "", texto: "" });
        setCargando(true);

        try {
            const response = await fetch(`${API_URL}/compras-proveedores`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok) {
                setMensaje({ tipo: "error", texto: data.error || "Error al registrar la compra." });
            } else {
                setMensaje({ tipo: "exito", texto: data.mensaje });
                setFormData({
                    id_proveedor: "",
                    numero_comprobante: "",
                    fecha_compra: new Date().toISOString().split("T")[0],
                    monto_total: "",
                    observaciones: "",
                });
                cargarDatos();
            }
        } catch (error) {
            setMensaje({ tipo: "error", texto: "Error de conexión con el backend." });
        } finally {
            setCargando(false);
        }
    };

    return (
        <main className="admin-container">
            <header className="admin-header">
                <span className="badge-admin">Panel de Administración</span>
                <h1>Gestión de Compras a Proveedores</h1>
                <p>Registrá las compras de mercadería para su posterior carga de detalle e ingreso a stock.</p>
            </header>

            <div className="admin-grid">
                <section className="card-panel">
                    <h2>Nueva Compra a Proveedor</h2>
                    {mensaje.texto && (
                        <div className={`alerta ${mensaje.tipo === "error" ? "alerta-error" : "alerta-exito"}`}>
                            {mensaje.texto}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="compra-form">
                        <div className="form-group">
                            <label htmlFor="id_proveedor">Proveedor *</label>
                            <select
                                id="id_proveedor"
                                name="id_proveedor"
                                value={formData.id_proveedor}
                                onChange={handleChange}
                                required
                            >
                                <option value="">Seleccionar proveedor...</option>
                                {proveedores.map((p) => (
                                    <option key={p.id_proveedor} value={p.id_proveedor}>
                                        {p.nombre} ({p.cuit})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="numero_comprobante">N° de Comprobante / Factura *</label>
                                <input
                                    type="text"
                                    id="numero_comprobante"
                                    name="numero_comprobante"
                                    placeholder="Ej: FC-A-0001-00004512"
                                    value={formData.numero_comprobante}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="fecha_compra">Fecha de Compra *</label>
                                <input
                                    type="date"
                                    id="fecha_compra"
                                    name="fecha_compra"
                                    value={formData.fecha_compra}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="monto_total">Monto Total ($) *</label>
                            <input
                                type="number"
                                id="monto_total"
                                name="monto_total"
                                step="0.01"
                                min="0"
                                placeholder="Ej: 250000.00"
                                value={formData.monto_total}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="observaciones">Observaciones</label>
                            <textarea
                                id="observaciones"
                                name="observaciones"
                                rows="3"
                                placeholder="Notas sobre la entrega, condición de pago, etc."
                                value={formData.observaciones}
                                onChange={handleChange}
                            />
                        </div>

                        <button type="submit" className="btn-guardar" disabled={cargando}>
                            {cargando ? "Registrando..." : "Registrar Compra"}
                        </button>
                    </form>
                </section>

                <section className="card-panel">
                    <h2>Compras Registradas</h2>
                    <p className="subtexto">
                        Compras disponibles para asociar detalle de factura (HU-29).
                    </p>

                    {compras.length === 0 ? (
                        <p className="sin-registros">Aún no hay compras registradas.</p>
                    ) : (
                        <div className="lista-compras">
                            {compras.map((c) => (
                                <article key={c.id_compra_proveedor} className="item-compra">
                                    <div className="item-compra-top">
                                        <strong>#{c.id_compra_proveedor} - {c.proveedor_nombre}</strong>
                                        <span className="estado-badge">{c.estado}</span>
                                    </div>
                                    <div className="item-compra-body">
                                        <span><strong>Comprobante:</strong> {c.numero_comprobante}</span>
                                        <span><strong>Fecha:</strong> {new Date(c.fecha_compra).toLocaleDateString("es-AR")}</span>
                                        <span><strong>Total:</strong> ${Number(c.monto_total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    {c.observaciones && (
                                        <p className="item-obs">{c.observaciones}</p>
                                    )}
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}