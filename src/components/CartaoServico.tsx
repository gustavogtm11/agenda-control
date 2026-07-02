// src/components/CartaoServico.tsx

interface ServicoProps {
  nomeDoServico: string;
  preco: number;
  // Nova regra: o componente precisa receber uma função para o clique do botão
  aoClicar: () => void; 
}

export function CartaoServico(props: ServicoProps) {
  return (
    <div style={{ 
      border: '1px solid #ccc', 
      padding: '15px', 
      margin: '10px 0',
      borderRadius: '8px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div>
        <h3>{props.nomeDoServico}</h3>
        <p>Valor: R$ {props.preco.toFixed(2)}</p>
      </div>
      
      {/* Aqui nós ligamos o clique do botão do HTML com a função que veio das Props */}
      <button 
        onClick={props.aoClicar} 
        style={{ padding: '10px 20px', cursor: 'pointer', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '4px' }}
      >
        Agendar
      </button>
    </div>
  );
}