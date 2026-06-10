### PONTIFÍCIA UNIVERSIDADE CATÓLICA DE MINAS GERAIS

```
Instituto de Ciências Exatas e Informática (ICEI)
Departamento de Sistemas de Informação e Engenharia de Software
Graduação em Engenharia de Software
TRABALHO PRÁTICO
Professor: Filipe Tório Lopes Ruas Nhimi
Disciplina: Arquitetura de Software (5º período)
Valor: 25 pontos
```
# Cache Aside e Performance de APIs

# Objetivo

Projetar, implementar e avaliar uma API RESTful que utilize o padrão Cache Aside para reduzir latência,
diminuir carga sobre o banco de dados e melhorar o desempenho de consultas frequentes.
O foco principal deste trabalho não é apenas implementar cache, mas principalmente demonstrar o impacto
arquitetural dessa decisão sobre desempenho, consistência e complexidade da solução.

# Cenário

Sua equipe foi contratada para otimizar uma API acadêmica que possui consultas frequentes a dados de alunos,
cursos, notas ou matrículas.
A aplicação apresenta lentidão em consultas repetitivas, especialmente em horários de pico. A equipe deverá
implementar uma estratégia de cache para melhorar o tempo de resposta e reduzir o número de acessos ao banco
de dados.

# Requisitos Funcionais

A API deve permitir:

- cadastrar registros;
- consultar registros individualmente;
- listar registros;
- atualizar registros;
- remover registros;
- consultar dados que possam ser armazenados em cache.

## Estrutura mínima da entidade

A entidade principal pode representar aluno, curso, produto, disciplina ou outro domínio escolhido pelo grupo.
A entidade deve possuir campos suficientes para permitir operações completas de cadastro, consulta, atualização
e remoção.

# Requisitos Técnicos

## API RESTful obrigatória

Implementar obrigatoriamente as operações: POST, GET, PUT, PATCH e DELETE.

## Tecnologias

As tecnologias utilizadas são de livre escolha para back-end, banco de dados, front-end, ferramenta de cache e
cloud provider.
Exemplos permitidos: .NET, Node.js, Java, Python, Go, Vue, React, Angular, PostgreSQL, MongoDB,
SQL Server, MySQL, Redis, Memcached, Grafana, Prometheus, entre outras.

# Requisito Principal — Cache Aside

A solução deve implementar o padrão Cache Aside.
Nesse padrão, a aplicação consulta primeiro o cache. Caso o dado não esteja disponível, a aplicação consulta
o banco de dados, armazena o resultado no cache e retorna a resposta ao consumidor.
A equipe deverá demonstrar como ocorre cache hit, cache miss e invalidação ou atualização do cache.

### 5


# Métricas Obrigatórias

A apresentação deverá demonstrar pelo menos:

- tempo médio de resposta sem cache;
- tempo médio de resposta com cache;
- quantidade de consultas ao banco de dados;
- quantidade de leituras atendidas pelo cache;
- cache hit e cache miss;
- impacto da invalidação do cache;
- discussão sobre consistência dos dados.

# Critérios de Avaliação

Os grupos serão avaliados considerando os seguintes critérios gerais:

- comunicação e clareza na apresentação da solução;
- cumprimento dos requisitos técnicos especificados;
- apresentação dos detalhes arquiteturais utilizando linguagem técnica adequada;
- qualidade da implementação;
- capacidade de demonstrar e justificar decisões arquiteturais;
- funcionamento da solução durante a apresentação;
- qualidade da estratégia de cache, análise de performance e discussão dos trade-offs de consistência.

### 6


