/**
 * @meshly/core - SAGA Transaction Coordinator
 */
import { EventStore } from "../events/events.js"
import { VerificationContract } from "../types.js"
import { Verifier } from "../verification/verifier.js"

export interface SagaStepDef {
  name: string
  contract: VerificationContract
  action: () => Promise<{ claimedSuccess?: boolean; [key: string]: any }>
  observeState: () => Promise<Record<string, any>>
  compensate?: (context: { stepIndex: number; error: string; intermediateState: any }) => Promise<void>
}

export interface SagaExecutionResult {
  completed: boolean
  successfulSteps: string[]
  failedStep?: string
  compensatedSteps: string[]
  error?: string
  finalObservation?: Record<string, any>
}

export class SagaTransaction {
  private workerId: string
  private steps: SagaStepDef[] = []
  private events?: EventStore

  constructor(workerId: string, events?: EventStore) {
    this.workerId = workerId
    this.events = events
  }

  addStep(step: SagaStepDef): this {
    this.steps.push(step)
    return this
  }

  async execute(): Promise<SagaExecutionResult> {
    const successfulSteps: { step: SagaStepDef; index: number }[] = []
    const compensatedSteps: string[] = []

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i]

      const { state } = await Verifier.verifyStep({
        workerId: this.workerId,
        contract: step.contract,
        executeAction: step.action,
        observeState: step.observeState,
        events: this.events,
      })

      if (state.workflowResult === "SUCCESS") {
        successfulSteps.push({ step, index: i })
      } else {
        const errorMsg = state.error || `Verification failed at step '${step.name}'`

        if (this.events) {
          this.events.emit("compensation.started", {
            workerId: this.workerId,
            data: { failedStep: step.name, stepsToCompensate: successfulSteps.length },
          })
        }

        for (let j = successfulSteps.length - 1; j >= 0; j--) {
          const prev = successfulSteps[j]
          if (prev.step.compensate) {
            try {
              await prev.step.compensate({
                stepIndex: prev.index,
                error: errorMsg,
                intermediateState: state.observations,
              })
              compensatedSteps.push(prev.step.name)
            } catch (compErr: any) {
              console.error(`[SagaTransaction] Compensation error on step '${prev.step.name}':`, compErr)
            }
          }
        }

        if (this.events) {
          this.events.emit("compensation.completed", {
            workerId: this.workerId,
            data: { compensatedSteps },
          })
        }

        return {
          completed: false,
          successfulSteps: successfulSteps.map((s) => s.step.name),
          failedStep: step.name,
          compensatedSteps,
          error: errorMsg,
          finalObservation: state.observations,
        }
      }
    }

    return {
      completed: true,
      successfulSteps: successfulSteps.map((s) => s.step.name),
      compensatedSteps: [],
    }
  }
}
