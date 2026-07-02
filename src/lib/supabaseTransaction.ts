export interface TransactionStep {
  name: string;
  execute: () => Promise<any>;
  rollback: (result: any) => Promise<any>;
}

/**
 * Helper per gestire transazioni multi-step sul client Supabase.
 * In caso di errore durante l'esecuzione di qualsiasi step,
 * esegue in ordine inverso (a ritroso) i rollback definiti per gli step completati in precedenza.
 */
export class SupabaseTransaction {
  private steps: TransactionStep[] = [];
  private executedSteps: { step: TransactionStep; result: any }[] = [];

  /**
   * Aggiunge uno step transazionale composto da una funzione di esecuzione ed una di rollback.
   */
  addStep(step: TransactionStep): this {
    this.steps.push(step);
    return this;
  }

  /**
   * Esegue la transazione. Se uno step fallisce, lancia un'eccezione dopo aver completato il rollback.
   */
  async run(): Promise<void> {
    this.executedSteps = [];
    
    for (const step of this.steps) {
      try {
        const result = await step.execute();
        this.executedSteps.push({ step, result });
      } catch (error) {
        // Esegue il rollback a ritroso per gli step precedenti
        await this.executeRollback();
        throw error;
      }
    }
  }

  /**
   * Esegue le azioni di rollback per tutti gli step completati fino al fallimento.
   */
  private async executeRollback(): Promise<void> {
    // Scorriamo gli step eseguiti in ordine inverso (a ritroso)
    for (let i = this.executedSteps.length - 1; i >= 0; i--) {
      const { step, result } = this.executedSteps[i];
      try {
        await step.rollback(result);
      } catch (rollbackError) {
        // Stampiamo un log d'errore ma continuiamo per non bloccare il rollback degli altri step
        console.error(
          `[SupabaseTransaction] Errore critico nel rollback dello step "${step.name}":`,
          rollbackError
        );
      }
    }
  }
}
