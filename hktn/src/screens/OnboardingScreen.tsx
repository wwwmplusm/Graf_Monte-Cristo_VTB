import { useState } from 'react';
import { Step1UserInfo } from '../components/steps/Step1UserInfo';
import { Step2BanksAndConsents } from '../components/steps/Step2BanksAndConsents';
import { Step4ProductSelection } from '../components/steps/Step4ProductSelection';
import { Step5Questions } from '../components/steps/Step5Questions';
import { Stepper } from '../components/Stepper';

export interface OnboardingData {
  user_profile: {
    user_id: string;
    display_name: string;
  };
  linked_banks: Array<{
    bank_id: string;
    name: string;
    connected: boolean;
  }>;
  consents: Array<{
    bank_id: string;
    consent_id: string;
    status: 'pending' | 'approved' | 'rejected';
  }>;
  selected_products: Array<{
    bank_id: string;
    product_id: string;
    product_type: 'loan' | 'deposit' | 'card';
  }>;
  goal: {
    type: 'close_debts' | 'save_money' | 'both';
    risk_mode: 'conservative' | 'balanced' | 'fast';
    save?: {
      amount_target: number;
      horizon: 'short' | 'long';
    };
    debts?: {
      selected_loan_ids: string[];
    };
  } | null;
}

interface OnboardingScreenProps {
  onComplete: (data: OnboardingData) => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [onboardingState, setOnboardingState] = useState<any>({
    user_id: '',
    user_name: '',
    banks: [],
    selected_bank_ids: [],
    consents: {},
    selected_products: [],
    goals: {
      mode: null,
      save_amount: null,
      save_speed: null,
      close_loan_ids: [],
      close_speed: null,
    },
  });

  const handleStep1Complete = (userId: string, userName: string) => {
    setOnboardingState((prev: any) => ({
      ...prev,
      user_id: userId,
      user_name: userName,
    }));
    setCurrentStep(2);
  };

  const handleStep2Complete = (banksWithConsents: any[]) => {
    const selectedBankIds = banksWithConsents.map((b) => b.bank_id);
    const consentsMap: Record<string, string> = {};
    
    // Store consents information
    banksWithConsents.forEach((bank) => {
      if (bank.consents.account) {
        consentsMap[`${bank.bank_id}-account`] = 'pending';
      }
      if (bank.consents.product) {
        consentsMap[`${bank.bank_id}-product`] = 'pending';
      }
      if (bank.consents.payment) {
        consentsMap[`${bank.bank_id}-payment`] = 'pending';
      }
    });

    setOnboardingState((prev: any) => ({
      ...prev,
      selected_bank_ids: selectedBankIds,
      banks_with_consents: banksWithConsents,
      consents: consentsMap,
      // Mark selected banks as connected
      banks: prev.banks.map((bank: any) => ({
        ...bank,
        connected: selectedBankIds.includes(bank.id),
      })),
    }));
    setCurrentStep(3);
  };

  const handleStep4Complete = (products: any[]) => {
    setOnboardingState((prev: any) => ({
      ...prev,
      selected_products: products,
    }));
    setCurrentStep(5);
  };

  const handleStep5Complete = (goals: any) => {
    // Map onboarding data to final structure
    const finalData: OnboardingData = {
      user_profile: {
        user_id: onboardingState.user_id || 'demo-user',
        display_name: onboardingState.user_name || 'Пользователь',
      },
      linked_banks: (onboardingState.banks || [])
        .filter((bank: any) => (onboardingState.selected_bank_ids || []).includes(bank.id))
        .map((bank: any) => ({
          bank_id: bank.id,
          name: bank.name,
          connected: true,
        })),
      consents: onboardingState.consents 
        ? Object.entries(onboardingState.consents).map(([bank_id, consent_id]) => ({
            bank_id,
            consent_id: consent_id as string,
            status: 'approved' as const,
          }))
        : [],
      selected_products: onboardingState.selected_products || [],
      goal: goals.mode ? {
        type: goals.mode === 'save' ? 'save_money' : goals.mode === 'close_loans' ? 'close_debts' : 'both',
        risk_mode: goals.save_speed || goals.close_speed || 'balanced',
        ...(goals.mode === 'save' || goals.mode === 'both' ? {
          save: {
            amount_target: goals.save_amount,
            horizon: goals.save_amount > 500000 ? 'long' : 'short',
          }
        } : {}),
        ...(goals.mode === 'close_loans' || goals.mode === 'both' ? {
          debts: {
            selected_loan_ids: goals.close_loan_ids || [],
          }
        } : {}),
      } : null,
    };

    onComplete(finalData);
  };

  const handleSkip = () => {
    // Create minimal onboarding data for skip
    const minimalData: OnboardingData = {
      user_profile: {
        user_id: 'demo-user',
        display_name: 'Иван',
      },
      linked_banks: [],
      consents: [],
      selected_products: [],
      goal: null,
    };
    onComplete(minimalData);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="max-w-4xl mx-auto px-4 py-6 md:py-8">
        {/* Stepper */}
        <div className="mb-8 md:mb-12">
          <Stepper currentStep={currentStep} totalSteps={4} />
        </div>

        {/* Step Content */}
        <div className="pb-20">
          {currentStep === 1 && (
            <Step1UserInfo
              onNext={handleStep1Complete}
              onSkip={handleSkip}
              initialUserId={onboardingState.user_id}
              initialName={onboardingState.user_name}
            />
          )}

          {currentStep === 2 && (
            <Step2BanksAndConsents
              onNext={handleStep2Complete}
              onBack={() => setCurrentStep(1)}
              onboardingState={onboardingState}
              setOnboardingState={setOnboardingState}
            />
          )}

          {currentStep === 3 && (
            <Step4ProductSelection
              onNext={handleStep4Complete}
              onBack={() => setCurrentStep(2)}
              connectedBanks={onboardingState.banks.filter((bank: any) =>
                onboardingState.selected_bank_ids?.includes(bank.id)
              )}
              initialProducts={onboardingState.selected_products}
            />
          )}

          {currentStep === 4 && (
            <Step5Questions
              onNext={handleStep5Complete}
              onBack={() => setCurrentStep(3)}
              initialGoals={onboardingState.goals}
            />
          )}
        </div>
      </div>
    </div>
  );
}
