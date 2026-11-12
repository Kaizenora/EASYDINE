import { Module } from '@nestjs/common';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { OrdersModule } from '../orders/orders.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [ReferralsModule, OrdersModule],
  controllers: [CustomersController],
  providers: [CustomersService, BranchAccessService],
  exports: [CustomersService],
})
export class CustomersModule {}
