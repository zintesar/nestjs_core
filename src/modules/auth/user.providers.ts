import { UserModel, UserOtpModel } from '../../models';
import { USER_REPOSITORY, USER_OTP_REPOSITORY } from '../../config/constants';

export const userProviders = [
  {
    provide: USER_REPOSITORY,
    useValue: UserModel,
  },
  {
    provide: USER_OTP_REPOSITORY,
    useValue: UserOtpModel,
  },
];
