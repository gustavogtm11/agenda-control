// src/components/Cabecalho.tsx

export function Cabecalho() {
return (
// No React, em vez de 'class', usamos 'className' para o CSS!
<header
    style={{ backgroundColor: "#2c3e50", color: "white", padding: "15px" }}
>
    <h2>Painel do Sistema</h2>
    <p>Gerencie seus serviços e agendamentos</p>
</header>
);
}
