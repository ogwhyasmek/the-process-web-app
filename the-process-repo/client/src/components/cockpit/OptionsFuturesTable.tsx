/** Options vs. Futures reference table (spec §6.2.7) — static. */

const ROWS = [
  ['Leverage', 'High, margin-based', 'High, baked into premium'],
  ['Max loss', 'Effectively uncapped if unhedged', 'Capped at premium if buying'],
  ['Time decay', 'None', 'Works against buyers'],
  ['Payoff shape', 'Linear', 'Non-linear (convex)'],
  ['Complexity', 'Simpler to reason about', 'Requires Greeks / IV literacy'],
] as const;

export function OptionsFuturesTable() {
  return (
    <section className="card" aria-labelledby="ovf-title">
      <h2 id="ovf-title">Options vs. futures</h2>
      <p className="card-sub">
        Neither instrument wins on its own — behavior is the variable. Know what you're holding.
      </p>
      <div className="table-scroll">
        <table className="ref-table">
          <thead>
            <tr>
              <th scope="col">Trait</th>
              <th scope="col">Futures</th>
              <th scope="col">Options</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([trait, fut, opt]) => (
              <tr key={trait}>
                <th scope="row">{trait}</th>
                <td>{fut}</td>
                <td>{opt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
