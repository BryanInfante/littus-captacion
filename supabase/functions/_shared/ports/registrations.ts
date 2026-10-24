import type {
  Registration,
  RegistrationDetails,
} from "../domain/registration.ts";

export interface Registrations {
  create(input: RegistrationDetails): Promise<Registration>;
}
