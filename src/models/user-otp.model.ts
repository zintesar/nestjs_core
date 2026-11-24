import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

export enum OtpType {
  PASSWORD_RESET = 'PASSWORD_RESET',
  LOGIN = 'LOGIN',
  VERIFICATION = 'VERIFICATION',
}

@Table({ tableName: 'user_otps', timestamps: true })
export class UserOtpModel extends Model {
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
  })
  Id: bigint;

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  User_Id: bigint;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  Email: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  Otp_Hash: string;

  @Column({
    type: DataType.ENUM(...Object.values(OtpType)),
    defaultValue: OtpType.PASSWORD_RESET,
    allowNull: false,
  })
  Type: OtpType;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
    allowNull: false,
  })
  Attempts: number;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  })
  Is_Used: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  Expires_At: Date;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  Created_At: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
  })
  Updated_At: Date;
}
